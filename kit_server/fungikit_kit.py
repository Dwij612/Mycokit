#!/usr/bin/env python3
"""
MycoKit kit server — the one program the Pi runs for the phone app (Final_UI).

Replaces the two services the Pi ran before (fungikit_web.py + the logger). One process now:

    - reads the ADS1219 once a second, ALL the time, so the app always has a live signal
    - writes a recording to the SD card only between Start and End (pressed in the app)
    - watches each probe for unusual activity (on the Pi, so alerts are caught with the phone closed)
    - keeps each recording's notes, "I did it" markers and alerts with it
    - serves the app itself (Final_UI) and the small JSON API it talks to
    - takes the time from the phone, as before (no clock battery, no internet)

Decisions (Dwij, 5 Oct 2026):
    - a power cut ends the recording; it does not carry on when the power comes back
    - alerts are detected on the Pi
    - only the new app is served (the earlier dashboard stays on disk, not on the network)
    - the mushroom's prompts are per phone, so they are NOT kept here

Measurement is unchanged from ads1219_logger_sd_web_clock.py: same driver, same four single-ended channels,
same gain (1) and internal 2.048 V reference, same CSV columns, one row a second, every row flushed and
fsync'd to the card as it is written.

Files, per recording, in DATA_DIR (the card's boot partition, so a Mac can read it directly):
    <id>.csv    Time,Elapsed_s,AIN0_mV,AIN1_mV,AIN2_mV,AIN3_mV
    <id>.json   who / when / how long / events / alert settings / how it ended

Run on the Pi (as root, for port 80 and the clock):   python3 /home/fungikit/fungikit_kit.py
Run on a laptop without the Pi (made-up signal):        FUNGIKIT_FAKE_ADC=1 FUNGIKIT_PORT=8080 \
                                                        FUNGIKIT_APP_DIR=../Final_UI FUNGIKIT_DATA_DIR=/tmp/fk \
                                                        python3 fungikit_kit.py
"""

import json
import math
import os
import random
import re
import shutil
import statistics
import sys
import threading
import time
from collections import deque
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from subprocess import DEVNULL, run
from urllib.parse import parse_qs, urlparse

# ------------------------------------------------------------------------------------------------ settings

FAKE      = os.environ.get("FUNGIKIT_FAKE_ADC") == "1"
SPEED     = float(os.environ.get("FUNGIKIT_SPEED", "1")) if FAKE else 1.0   # fake only: run time N× faster
APP_DIR   = os.environ.get("FUNGIKIT_APP_DIR", "/home/fungikit/app")
DATA_DIR  = os.environ.get("FUNGIKIT_DATA_DIR", "/boot/firmware/fungikit_data")
STATE_DIR = os.environ.get("FUNGIKIT_STATE_DIR", "/home/fungikit/state")
PORT      = int(os.environ.get("FUNGIKIT_PORT", "80"))

PERIOD_S        = 1.0                 # one row a second (recording time)
LIVE_KEEP_S     = 15 * 60             # live buffer kept in memory
LIVE_SEND_S     = 10 * 60             # the Live graph shows the last 10 minutes
HEADER          = "Time,Elapsed_s,AIN0_mV,AIN1_mV,AIN2_mV,AIN3_mV\n"
BYTES_PER_HOUR  = 70 * 3600           # ~70 bytes a row
MIN_HOURS_START = 1.0                 # refuse to start with less room than this

# settling: no alerts until the recording is SETTLE_S old AND every probe has steadied,
# or SETTLE_MAX_S has passed (so one drifting probe can't hold the alerts off for ever)
SETTLE_S        = 30                  # 8 Oct 2026 (Dwij): 2 min → 30 s
SETTLE_MAX_S    = 2 * 60              # was 10 min: never wait longer than the old fixed settle
STEADY_WIN      = 15                  # samples (s) per window: two 15 s windows, so it can pass at 30 s (was 30)
STEADY_MV       = 0.25                # change between the two window averages

# unusual-activity alerts — the same rule as the app's demo (js/modules/detector.js)
ALERT_EVERY_S   = 5                   # judge one sample every 5 s
ALERT_BASE_N    = 36                  # 3 minutes of baseline
ALERT_GUARD_N   = 3
SENSITIVITY     = {"low": 9.0, "medium": 7.0, "high": 5.0}   # in sigma
ALERT_GAP_S     = 5 * 60              # at most one alert per probe every 5 minutes

# clock (unchanged from fungikit_web.py)
TOLERANCE_S, RESYNC_MIN_S = 2.0, 30.0
MIN_EPOCH, MAX_EPOCH = 1767225600, 4102444800
JUMP_S = 5.0
MAX_BODY = 8192

CODE_CHARS = "ACDEFGHJKMNPQRTUVWXY34679"             # same as the app: no 0/O, 1/I/L, 2/Z, 5/S, 8/B
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(STATE_DIR, exist_ok=True)
LOCK = threading.RLock()


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def iso(epoch):
    return datetime.fromtimestamp(epoch).isoformat(timespec="milliseconds")


def write_json(path, obj):
    """Atomic and on the card now: write a temp file, fsync, rename over the old one."""
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=1)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def read_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


# ------------------------------------------------------------------------------------------------ the ADC

class ADS1219:
    """Same driver as ads1219_logger_sd_web_clock.py."""
    ADDR, CMD_RESET, CMD_START, CMD_RDATA, CMD_WREG, RREG_STATUS = 0x40, 0x06, 0x08, 0x10, 0x40, 0x24
    MUX_SINGLE = {0: 0b011, 1: 0b100, 2: 0b101, 3: 0b110}

    def __init__(self):
        import smbus2
        self.bus = smbus2.SMBus(1)
        self.bus.write_byte(self.ADDR, self.CMD_RESET)
        time.sleep(0.01)

    def read_mv(self, ch):
        self.bus.write_i2c_block_data(self.ADDR, self.CMD_WREG, [self.MUX_SINGLE[ch] << 5])
        self.bus.write_byte(self.ADDR, self.CMD_START)
        t_end = time.monotonic() + 0.5
        while not (self.bus.read_byte_data(self.ADDR, self.RREG_STATUS) & 0x80):
            if time.monotonic() > t_end:
                raise OSError("ADS1219 conversion timed out")
            time.sleep(0.005)
        b = self.bus.read_i2c_block_data(self.ADDR, self.CMD_RDATA, 3)
        raw = (b[0] << 16) | (b[1] << 8) | b[2]
        if raw & 0x800000:
            raw -= 0x1000000
        return raw * 2048.0 / 8388608.0

    def read_all(self):
        return [self.read_mv(ch) for ch in range(4)]


class FakeADC:
    """For testing without the Pi: electrode-like offsets, drift, noise, settling and the odd spike.
    Not fungal data. Everything it makes is marked FAKE in the recording's .json."""

    def __init__(self):
        self.off = [-21.0, -14.0, -1.0, -43.0]
        self.walk = [0.0] * 4
        self.spike = [None] * 4
        self.n = 0

    def read_all(self):
        self.n += 1
        out = []
        for i in range(4):
            self.walk[i] += random.gauss(0, 0.02)
            settle = 3.0 * math.exp(-self.n / 8.0) * (1 if i % 2 else -1)    # fake ADC: settles in ~30 s (8 Oct 2026)
            if self.spike[i] is None and random.random() < 1 / 1500:
                self.spike[i] = (self.n, random.uniform(0.6, 1.4) * random.choice((1, -1)))
            sp = 0.0
            if self.spike[i]:
                t0, a = self.spike[i]
                d = self.n - t0
                sp = a * math.exp(-((d - 20) / 12.0) ** 2)
                if d > 60:
                    self.spike[i] = None
            out.append(self.off[i] + self.walk[i] + settle + sp + random.gauss(0, 0.065))
        return out


# ------------------------------------------------------------------------------------------------ the clock

CLOCK_PATH = os.path.join(STATE_DIR, "clock.json")


def _boot_epoch():
    try:
        with open("/proc/uptime") as f:
            return time.time() - float(f.read().split()[0])
    except OSError:
        return 0


def load_clock():
    st = read_json(CLOCK_PATH, {})
    if st.get("synced_epoch", 0) > _boot_epoch():
        return st
    return {"synced": False, "history": []}


CLOCK = load_clock()


def apply_sync(epoch, tz_name, source):
    """Unchanged rules from fungikit_web.py: range check, tolerance, and no small re-syncs once synced."""
    now = time.time()
    delta = epoch - now
    rec = {"at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "offered": epoch, "delta_s": round(delta, 3), "tz": tz_name, "source": source}
    if not (MIN_EPOCH < epoch < MAX_EPOCH):
        rec["outcome"] = "rejected: implausible time"
    elif abs(delta) <= TOLERANCE_S:
        rec["outcome"] = "no change: already within tolerance"
        CLOCK["synced"] = True
        CLOCK.setdefault("synced_epoch", now)
    elif CLOCK.get("synced") and abs(delta) < RESYNC_MIN_S:
        rec["outcome"] = "ignored: already synced this boot"
    elif FAKE:
        rec["outcome"] = "not applied: fake ADC mode never touches the clock"
        CLOCK["synced"] = True
        CLOCK.setdefault("synced_epoch", now)
    else:
        ok = False
        try:
            time.clock_settime(time.CLOCK_REALTIME, epoch)
            ok = True
        except (OSError, PermissionError, AttributeError):
            stamp = datetime.fromtimestamp(epoch).strftime("%Y-%m-%d %H:%M:%S.%f")
            ok = run(["date", "-s", stamp], stdout=DEVNULL, stderr=DEVNULL).returncode == 0
        if ok:
            rec["outcome"] = "applied"
            CLOCK.update(synced=True, synced_epoch=epoch, applied_delta_s=round(delta, 3), tz=tz_name)
            run(["fake-hwclock", "save"], stdout=DEVNULL, stderr=DEVNULL)
        else:
            rec["outcome"] = "failed: could not set clock (not running as root?)"
    CLOCK.setdefault("history", []).insert(0, rec)
    del CLOCK["history"][5:]
    try:
        write_json(CLOCK_PATH, CLOCK)
    except OSError:
        pass
    return rec


# ------------------------------------------------------------------------------------------------ alerts

class Detector:
    """Each probe against its own recent baseline: median and MAD (×1.4826 ≈ one standard deviation),
    a guard gap of a few samples, then a threshold in sigma. Same maths as js/modules/detector.js."""

    def __init__(self, sigma):
        self.sigma = sigma
        self.hist = [deque(maxlen=ALERT_BASE_N + ALERT_GUARD_N + 1) for _ in range(4)]
        self.last = [-1e18] * 4

    def push(self, at_s, values, watch):
        hits = []
        need = ALERT_BASE_N + ALERT_GUARD_N + 1
        for i, v in enumerate(values):
            h = self.hist[i]
            h.append(v)
            if len(h) < need:
                continue
            base = list(h)[:ALERT_BASE_N]
            med = statistics.median(base)
            mad = statistics.median([abs(x - med) for x in base]) * 1.4826 or 1e-6
            z = (v - med) / mad
            if abs(z) >= self.sigma and watch[i] and at_s - self.last[i] >= ALERT_GAP_S:
                self.last[i] = at_s
                hits.append((i + 1, z))
        return hits


# ------------------------------------------------------------------------------------------------ recordings

def meta_path(rid):
    return os.path.join(DATA_DIR, rid + ".json")


def csv_path(rid):
    return os.path.join(DATA_DIR, rid + ".csv")


def all_metas():
    out = []
    try:
        names = os.listdir(DATA_DIR)
    except OSError:
        return out
    for n in names:
        if n.endswith(".json") and not n.endswith(".meta.json"):
            m = read_json(os.path.join(DATA_DIR, n))
            if m and m.get("format") == "fungikit-recording/1":
                out.append(m)
    return out


def new_code():
    taken = {m.get("code") for m in all_metas()}
    while True:
        c = "FK-" + "".join(random.choice(CODE_CHARS) for _ in range(4))
        if c not in taken:
            return c


def last_elapsed(path):
    """Elapsed_s of the last complete row of a CSV (reads only the end of the file)."""
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(0, size - 4096))
            lines = f.read().decode(errors="ignore").splitlines()
        for line in reversed(lines):
            parts = line.split(",")
            if len(parts) >= 6:
                try:
                    return float(parts[1])
                except ValueError:
                    continue
    except OSError:
        pass
    return 0.0


def close_unfinished():
    """A power cut ends the recording (Dwij, 5 Oct 2026). On start-up, any recording that was never
    ended is closed at its last row and marked as ended by a power cut."""
    for m in all_metas():
        if m.get("ended_at"):
            continue
        length = last_elapsed(csv_path(m["id"]))
        m["length_s"] = round(length, 3)
        m["ended_at"] = iso(m["started_epoch_ms"] / 1000 + length)
        m["end_reason"] = "power"
        try:
            write_json(meta_path(m["id"]), m)
            log("closed after power cut:", m["id"], f"{length:.0f} s")
        except OSError as e:
            log("could not close", m["id"], e)


class Recording:
    """The one recording running now. Everything here is touched only with LOCK held."""

    def __init__(self, name, mono_start):
        now = time.time()
        self.t0 = now                                      # wall-clock start; Time = t0 + elapsed
        self.mono_start = mono_start                       # kit time at Start
        self.code = new_code()
        self.id = datetime.fromtimestamp(now).strftime("%Y-%m-%d_%H-%M-%S") + "_" + self.code
        self.meta = {
            "format": "fungikit-recording/1",
            "id": self.id,
            "code": self.code,
            "name": name,
            "started_at": iso(now),
            "started_epoch_ms": int(now * 1000),
            "ended_at": None,
            "end_reason": None,
            "length_s": 0,
            "events": [],
            "settled_at_ms": None,
            "alert_settings": {"sensitivity": "medium", "watch": [True, True, True, True]},
            "clock_trusted_at_start": bool(CLOCK.get("synced")),
            "clock_correction_s": 0.0,
            "adc": "fake (testing, not fungal data)" if FAKE else "ADS1219, gain 1, internal 2.048 V ref, single-ended",
            "columns": HEADER.strip().split(","),
        }
        self.t, self.v = [], [[], [], [], []]               # the whole recording, in memory for the graphs
        self.detector = Detector(SENSITIVITY["medium"])
        self.f = open(csv_path(self.id), "w")
        self.f.write(HEADER)
        self.f.flush()
        os.fsync(self.f.fileno())
        self.save_meta()

    # --- elapsed (recording time, seconds) for a kit-time instant
    def el(self, mono):
        return mono - self.mono_start

    def save_meta(self):
        self.meta["length_s"] = round(self.t[-1], 3) if self.t else 0
        write_json(meta_path(self.id), self.meta)

    def add_row(self, el, vals):
        self.f.write(f"{iso(self.t0 + el)},{el:.3f}," + ",".join(f"{v:.6f}" for v in vals) + "\n")
        self.f.flush()
        os.fsync(self.f.fileno())
        self.t.append(el)
        for i in range(4):
            self.v[i].append(vals[i])

    def add_event(self, kind, label, el, probe=None):
        ev = {"kind": kind, "at_ms": int(round(el * 1000)), "wall": iso(self.t0 + el), "label": label}
        if probe:
            ev["probe"] = probe
        self.meta["events"].append(ev)
        self.save_meta()
        return ev

    def settle_check(self, el):
        if self.meta["settled_at_ms"] is not None or el < SETTLE_S:
            return
        w = STEADY_WIN
        steady = len(self.t) >= 2 * w and all(
            abs(statistics.fmean(self.v[i][-w:]) - statistics.fmean(self.v[i][-2 * w:-w])) <= STEADY_MV
            for i in range(4))
        if steady or el >= SETTLE_MAX_S:
            self.meta["settled_at_ms"] = int(el * 1000)
            self.save_meta()

    def clock_stepped(self, drift):
        """The wall clock jumped during this recording. If the start time was a guess, move it and recompute
        the Time column; if the start was already synced (the usual case — Start sends the phone's time),
        the recording keeps its times and only the step is noted."""
        if self.meta["clock_trusted_at_start"]:
            return
        self.t0 += drift
        self.meta["clock_correction_s"] = round(self.meta["clock_correction_s"] + drift, 3)
        self.meta["started_at"] = iso(self.t0)
        self.meta["started_epoch_ms"] = int(self.t0 * 1000)
        self.meta["clock_trusted_at_start"] = True        # only correct once
        for ev in self.meta["events"]:
            ev["wall"] = iso(self.t0 + ev["at_ms"] / 1000)
        self.f.close()
        path = csv_path(self.id)
        tmp = path + ".tmp"
        with open(path) as src, open(tmp, "w") as dst:
            dst.write(src.readline() or HEADER)
            for line in src:
                p = line.rstrip("\n").split(",")
                if len(p) < 6:
                    continue
                try:
                    p[0] = iso(self.t0 + float(p[1]))
                except ValueError:
                    continue
                dst.write(",".join(p) + "\n")
            dst.flush()
            os.fsync(dst.fileno())
        os.replace(tmp, path)
        self.f = open(path, "a")
        self.save_meta()
        log("recording start time corrected by", round(drift, 1), "s")

    def end(self, reason="ended"):
        self.meta["ended_at"] = iso(self.t0 + (self.t[-1] if self.t else 0))
        self.meta["end_reason"] = reason
        try:
            self.f.flush()
            os.fsync(self.f.fileno())
            self.f.close()
        except OSError:
            pass
        self.save_meta()


# ------------------------------------------------------------------------------------------------ the kit

class Kit:
    def __init__(self):
        self.adc = FakeADC() if FAKE else None        # the real ADC is opened in run(), and re-opened if it drops out
        self.live = deque(maxlen=int(LIVE_KEEP_S / PERIOD_S) + 5)   # (kit_s, [4 values])
        self.rec = None
        self.adc_ok = True
        self.adc_error = None
        self.mono0 = time.monotonic()
        self.seq = 0

    def kit_s(self):
        """Kit time: seconds since the program started (×SPEED when testing with the fake ADC)."""
        return (time.monotonic() - self.mono0) * SPEED

    def run(self):
        wall_ref, kit_ref = time.time(), self.kit_s()
        while True:
            # --- did something step the wall clock? (fake mode never steps it)
            drift = (time.time() - wall_ref) - (self.kit_s() - kit_ref) / SPEED
            if abs(drift) > JUMP_S:
                with LOCK:
                    if self.rec:
                        try:
                            self.rec.clock_stepped(drift)
                        except OSError as e:
                            log("clock correction failed:", e)
                wall_ref += drift

            ks = self.kit_s()
            try:
                if self.adc is None:
                    self.adc = ADS1219()
                vals = self.adc.read_all()
                if not self.adc_ok:
                    log("ADC reading again")
                self.adc_ok, self.adc_error = True, None
            except (OSError, ImportError) as e:       # a loose wire: keep the program alive, say so in /api/status
                if self.adc_ok:
                    log("ADC not answering:", e)
                self.adc_ok, self.adc_error = False, str(e)
                self.adc = None if not FAKE else self.adc
                vals = None

            with LOCK:
                if vals is not None:
                    self.live.append((ks, vals))
                r = self.rec
                if r and vals is not None:
                    el = r.el(ks)
                    try:
                        r.add_row(el, vals)
                    except OSError as e:
                        log("could not write row:", e)
                    n = len(r.t)
                    r.settle_check(el)
                    if n % int(ALERT_EVERY_S / PERIOD_S) == 0:
                        watch = r.meta["alert_settings"]["watch"] if r.meta["settled_at_ms"] is not None else [False] * 4
                        for probe, z in r.detector.push(el, vals, watch):
                            r.add_event("alert", f"Probe {probe} {'jumped up' if z > 0 else 'dropped'}", el, probe)
                    if n % 30 == 0:
                        r.save_meta()                 # length on the card stays within 30 s of the truth

            self.seq += 1
            target = self.mono0 + self.seq * PERIOD_S / SPEED
            time.sleep(max(0.0, target - time.monotonic()))

    # --- actions (called from HTTP threads)

    def start(self, name):
        with LOCK:
            if self.rec:
                return None, "A recording is already running."
            if hours_left() < MIN_HOURS_START:
                return None, "The card is full."
            self.rec = Recording(name, self.kit_s())
            log("started", self.rec.id)
            return self.rec, None

    def end(self, reason="ended"):
        with LOCK:
            r = self.rec
            if not r:
                return None
            r.end(reason)
            self.rec = None
            log("ended", r.id, f"{r.meta['length_s']:.0f} s")
            return r


KIT = None


def storage():
    """(hours of recording the card still has room for, percent free) — None, None if unknown."""
    try:
        u = shutil.disk_usage(DATA_DIR)
        return u.free / BYTES_PER_HOUR, 100.0 * u.free / u.total
    except OSError:
        return None, None


def hours_left():
    h, _ = storage()
    return h if h is not None else float("inf")


# ------------------------------------------------------------------------------------------------ data out

def summary(m, live=False):
    ev = m.get("events", [])
    return {
        "id": m["id"], "code": m["code"], "name": m.get("name"),
        "started_at": m["started_at"], "started_epoch_ms": m["started_epoch_ms"],
        "length_ms": int(m.get("length_s", 0) * 1000), "live": live,
        "end_reason": m.get("end_reason"),
        "has_notes": any(e["kind"] == "note" for e in ev), "events_count": len(ev),
    }


def full(m, live=False):
    out = summary(m, live)
    out["events"] = m.get("events", [])
    out["settled_at_ms"] = m.get("settled_at_ms")
    out["alert_settings"] = m.get("alert_settings")
    return out


_cache = {}


def load_series(rid):
    """(t, [v1..v4]) for a recording: from memory if it is running, from its CSV otherwise (cached)."""
    with LOCK:
        r = KIT.rec
        if r and r.id == rid:
            return list(r.t), [list(c) for c in r.v]
    path = csv_path(rid)
    try:
        st = os.stat(path)
    except OSError:
        return None
    key = (rid, st.st_mtime, st.st_size)
    if _cache.get("key") == key:
        return _cache["data"]
    t, v = [], [[], [], [], []]
    with open(path) as f:
        f.readline()
        for line in f:
            p = line.split(",")
            if len(p) < 6:
                continue
            try:
                row = [float(x) for x in p[1:6]]
            except ValueError:
                continue
            t.append(row[0])
            for i in range(4):
                v[i].append(row[i + 1])
    _cache.update(key=key, data=(t, v))
    return t, v


def bucket(t, v, a0, a1, n):
    """n evenly spaced points over a0..a1 (seconds): the mean of each bucket, gaps carried forward."""
    n = max(2, min(int(n), 20000))
    out = [[None] * n for _ in range(4)]
    if not t or a1 <= a0:
        return [[0.0] * n for _ in range(4)]
    sums = [[0.0] * n for _ in range(4)]
    cnt = [0] * n
    span = a1 - a0
    for k, tk in enumerate(t):
        if tk < a0 or tk > a1:
            continue
        b = min(n - 1, int((tk - a0) / span * (n - 1) + 0.5))
        cnt[b] += 1
        for i in range(4):
            sums[i][b] += v[i][k]
    for i in range(4):
        last = None
        for b in range(n):
            if cnt[b]:
                last = sums[i][b] / cnt[b]
            out[i][b] = round(last, 5) if last is not None else None
        first = next((x for x in out[i] if x is not None), 0.0)
        out[i] = [first if x is None else x for x in out[i]]
    return out


def csv_text(rid):
    with open(csv_path(rid)) as f:
        return f.read()


# ------------------------------------------------------------------------------------------------ HTTP

class Handler(SimpleHTTPRequestHandler):

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=APP_DIR, **kw)

    # never let a phone keep an old copy of the app or of any data
    def end_headers(self):
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/live" in self.requestline or "/api/status" in self.requestline:
            return
        super().log_message(fmt, *args)

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n < 0 or n > MAX_BODY:
            raise ValueError("body too large")
        return json.loads(self.rfile.read(n) or b"{}") if n else {}

    # ---------------- GET
    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[-1] for k, v in parse_qs(u.query).items()}
        path = u.path
        try:
            if path == "/api/status":
                return self._json(200, status())
            if path == "/api/live":
                return self._json(200, live(float(q.get("since_ms", -1))))
            if path == "/api/recordings":
                return self._json(200, recordings())
            m = re.match(r"^/api/recordings/([^/]+)(?:/(series|csv|bundle))?$", path)
            if m:
                rid, what = m.group(1), m.group(2)
                if not ID_RE.match(rid):
                    return self._json(400, {"error": "bad id"})
                meta, is_live = find(rid)
                if not meta:
                    return self._json(404, {"error": "no such recording"})
                if what is None:
                    return self._json(200, full(meta, is_live))
                if what == "series":
                    return self._json(200, series(rid, q))
                if what == "csv":
                    return self._file(csv_text(rid).encode(), "text/csv", f"{meta['code']}.csv")
                if what == "bundle":
                    return self._json(200, bundle(meta, is_live))
            if path.startswith("/api/"):
                return self._json(404, {"error": "no such endpoint"})
        except (ValueError, KeyError) as e:
            return self._json(400, {"error": str(e)})
        except OSError as e:
            return self._json(500, {"error": str(e)})
        return super().do_GET()

    def _file(self, data, ctype, filename):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(data)

    # ---------------- POST
    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = self._body()
        except (ValueError, TypeError):
            return self._json(400, {"error": "expected a small JSON body"})
        try:
            if path == "/api/settime":
                epoch = float(body["epoch_ms"]) / 1000.0
                r = apply_sync(epoch, body.get("tz", "?"), self.headers.get("User-Agent", "?")[:80])
                return self._json(200, {"outcome": r["outcome"], "delta_s": r["delta_s"], "synced": bool(CLOCK.get("synced"))})

            if path == "/api/recording/start":
                if "epoch_ms" in body:                      # the phone that pressed Start also sets the time
                    apply_sync(float(body["epoch_ms"]) / 1000.0, body.get("tz", "?"), "start")
                name = (str(body.get("name") or "").strip()[:24]) or None
                rec, err = KIT.start(name)
                if err:
                    return self._json(409, {"ok": False, "error": err})
                return self._json(200, {"ok": True, "session": session(rec)})

            if path == "/api/recording/end":
                r = KIT.end()
                if not r:
                    return self._json(409, {"ok": False, "error": "Nothing is recording."})
                return self._json(200, {"ok": True, "id": r.id})

            if path == "/api/recording/events":
                kind, label = body.get("kind"), str(body.get("label") or "").strip()
                if kind not in ("marker", "note") or not label or len(label) > 500:
                    return self._json(400, {"error": "kind must be marker or note, with a label of 1–500 characters"})
                with LOCK:
                    r = KIT.rec
                    if not r:
                        return self._json(409, {"error": "Nothing is recording."})
                    ev = r.add_event(kind, label, r.el(KIT.kit_s()))
                return self._json(200, {"ok": True, "event": ev})

            if path == "/api/recording/events/delete":
                at, kind = int(body["at_ms"]), body.get("kind")
                with LOCK:
                    r = KIT.rec
                    if not r:
                        return self._json(409, {"error": "Nothing is recording."})
                    before = len(r.meta["events"])
                    r.meta["events"] = [e for e in r.meta["events"] if not (e["at_ms"] == at and e["kind"] == kind and kind == "note")]
                    if len(r.meta["events"]) != before:
                        r.save_meta()
                return self._json(200, {"ok": True})

            if path == "/api/recording/alert-settings":
                sens = body.get("sensitivity")
                watch = body.get("watch")
                with LOCK:
                    r = KIT.rec
                    if not r:
                        return self._json(409, {"error": "Nothing is recording."})
                    s = r.meta["alert_settings"]
                    if sens in SENSITIVITY:
                        s["sensitivity"] = sens
                        r.detector.sigma = SENSITIVITY[sens]
                    if isinstance(watch, list) and len(watch) == 4:
                        s["watch"] = [bool(x) for x in watch]
                    r.save_meta()
                    return self._json(200, {"ok": True, "alert_settings": s})

            m = re.match(r"^/api/recordings/([^/]+)/delete$", path)
            if m:
                rid = m.group(1)
                if not ID_RE.match(rid):
                    return self._json(400, {"error": "bad id"})
                with LOCK:
                    if KIT.rec and KIT.rec.id == rid:
                        return self._json(409, {"error": "End the recording before deleting it."})
                meta, _ = find(rid)
                if not meta:
                    return self._json(404, {"error": "no such recording"})
                for p in (csv_path(rid), meta_path(rid)):
                    try:
                        os.remove(p)
                    except FileNotFoundError:
                        pass
                _cache.clear()
                log("deleted", rid)
                return self._json(200, {"ok": True})
        except (ValueError, KeyError, TypeError) as e:
            return self._json(400, {"error": f"bad request: {e}"})
        except OSError as e:
            return self._json(500, {"error": str(e)})
        return self._json(404, {"error": "no such endpoint"})


def session(r):
    return {"id": r.id, "code": r.code, "name": r.meta["name"], "started_at": r.meta["started_at"]}


def status():
    h, pct = storage()
    with LOCK:
        r = KIT.rec
        return {
            "recording": bool(r),
            "session": session(r) if r else None,
            "length_ms": int(r.el(KIT.kit_s()) * 1000) if r else None,
            "storage": {"hours_left": h, "percent_free": pct},
            # the probe check is switched off in the app (SHOW_PROBE_CHECK); every probe reports as reading
            "probes": [{"id": i + 1, "reading": True} for i in range(4)],
            "adc_ok": KIT.adc_ok,
            "adc_error": KIT.adc_error,
            "clock_synced": bool(CLOCK.get("synced")),
            "fake": FAKE,
        }


def live(since_ms):
    """The running recording's last 10 minutes (or only what is newer than since_ms), plus its events."""
    with LOCK:
        r = KIT.rec
        if not r:
            return {"recording": False}
        now_ms = int(r.el(KIT.kit_s()) * 1000)
        lo = max(since_ms / 1000.0, (now_ms / 1000.0) - LIVE_SEND_S)
        k = len(r.t)
        while k > 0 and r.t[k - 1] > lo:
            k -= 1
        return {
            "recording": True,
            "id": r.id,
            "length_ms": now_ms,
            "t_ms": [int(round(x * 1000)) for x in r.t[k:]],
            "values": [[round(x, 5) for x in c[k:]] for c in r.v],
            "events": r.meta["events"],
            "settled_at_ms": r.meta["settled_at_ms"],
            "alert_settings": r.meta["alert_settings"],
            "adc_ok": KIT.adc_ok,
        }


def find(rid):
    with LOCK:
        r = KIT.rec
        if r and r.id == rid:
            m = dict(r.meta)
            m["length_s"] = r.el(KIT.kit_s())
            return m, True
    m = read_json(meta_path(rid))
    return (m, False) if m and m.get("format") == "fungikit-recording/1" else (None, False)


def recordings():
    with LOCK:
        cur = KIT.rec.id if KIT.rec else None
    out = []
    for m in all_metas():
        if m["id"] == cur:
            continue
        out.append(summary(m))
    out.sort(key=lambda x: x["started_epoch_ms"], reverse=True)
    if cur:
        m, _ = find(cur)
        out.insert(0, summary(m, live=True))
    h, pct = storage()
    return {"recordings": out, "current_id": cur, "storage": {"hours_left": h, "percent_free": pct}}


def series(rid, q):
    data = load_series(rid)
    if data is None:
        raise ValueError("no data")
    t, v = data
    length = t[-1] if t else 0.0
    a0 = float(q.get("from_ms", 0)) / 1000.0
    a1 = float(q.get("to_ms", length * 1000)) / 1000.0
    n = int(q.get("n", 200))
    return {"length_ms": int(length * 1000), "from_ms": int(a0 * 1000), "to_ms": int(a1 * 1000),
            "values": bucket(t, v, a0, a1, n)}


def bundle(meta, is_live):
    """What the phone carries to the project website. The phone adds which photos were taken."""
    return {
        "format": "fungikit-bundle/1",
        "session_code": meta["code"],
        "name": meta.get("name"),
        "started_at": meta["started_at"],
        "length_s": round(float(meta.get("length_s", 0)), 1),
        "still_recording": is_live,
        "end_reason": meta.get("end_reason"),
        "events": [{"kind": e["kind"], "at_s": round(e["at_ms"] / 1000), "wall": e["wall"],
                    "text": e["label"], "probe": e.get("probe")} for e in meta.get("events", [])],
        "kit": {"adc": meta.get("adc"), "rate_hz": 1 / PERIOD_S, "units": "mV"},
        "csv": csv_text(meta["id"]),
    }


# ------------------------------------------------------------------------------------------------ main

def main():
    global KIT
    log("MycoKit kit server", "(FAKE ADC — test data)" if FAKE else "", f"port {PORT}")
    log("app:", APP_DIR, "| data:", DATA_DIR)
    close_unfinished()
    KIT = Kit()
    threading.Thread(target=KIT.run, daemon=True, name="sampler").start()
    ThreadingHTTPServer.daemon_threads = True
    srv = ThreadingHTTPServer(("", PORT), Handler)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        # a clean stop (systemctl stop, reboot) is treated like a power cut: the recording ends
        if KIT.rec:
            KIT.end("power")


def _on_term(*_):
    raise KeyboardInterrupt


if __name__ == "__main__":
    import signal
    signal.signal(signal.SIGTERM, _on_term)
    main()
