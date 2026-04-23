#!/usr/bin/env python3
"""
Logix Plus Solutions — Development Launcher
Double-click this file (or run: python3 start.py) to:
  1. Install dependencies (if needed)
  2. Start the backend server
  3. Start the frontend dev server
  4. Automatically open the browser
"""

import os
import sys
import time
import signal
import platform
import subprocess
import webbrowser
import urllib.request
import urllib.error

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR   = os.path.join(SCRIPT_DIR, "server")
CLIENT_DIR   = os.path.join(SCRIPT_DIR, "client")
CLIENT_URL   = "http://localhost:5173"
SERVER_URL   = "http://localhost:3000"
POLL_TIMEOUT = 90   # seconds to wait for servers to start
IS_WIN       = platform.system() == "Windows"
NPM          = "npm.cmd" if IS_WIN else "npm"

processes = []

# ── Helpers ───────────────────────────────────────────────────────────────────
def log(msg):
    print(f"  {msg}", flush=True)

def header(msg):
    print(f"\n{'─'*60}", flush=True)
    print(f"  {msg}", flush=True)
    print(f"{'─'*60}", flush=True)

def check_npm():
    try:
        subprocess.run([NPM, "--version"], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("\n✗  Node.js / npm not found.")
        print("   Install from: https://nodejs.org  (LTS version)")
        input("\n   Press Enter to exit…")
        sys.exit(1)

def needs_install(directory):
    nm = os.path.join(directory, "node_modules")
    pkg = os.path.join(directory, "package.json")
    if not os.path.isdir(nm):
        return True
    # Re-install if package.json is newer than node_modules
    return os.path.getmtime(pkg) > os.path.getmtime(nm)

def npm_install(directory, label):
    log(f"Installing {label} dependencies…")
    result = subprocess.run(
        [NPM, "install", "--prefer-offline"],
        cwd=directory,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"\n✗  npm install failed in {label}:")
        print(result.stderr[-2000:])
        input("\n   Press Enter to exit…")
        sys.exit(1)
    log(f"{label} dependencies ready.")

def start_process(cmd, cwd, label):
    log(f"Starting {label}…")
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        shell=IS_WIN,    # needed on Windows for npm.cmd
    )
    processes.append(proc)
    return proc

def wait_for_url(url, label, timeout=POLL_TIMEOUT):
    log(f"Waiting for {label} ({url})…")
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2)
            log(f"{label} is ready ✓")
            return True
        except Exception:
            time.sleep(1)
    return False

def shutdown(sig=None, frame=None):
    print("\n\n  Shutting down servers…", flush=True)
    for p in processes:
        try:
            if IS_WIN:
                p.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                p.terminate()
        except Exception:
            pass
    for p in processes:
        try:
            p.wait(timeout=5)
        except Exception:
            p.kill()
    print("  Done. Goodbye!\n", flush=True)
    sys.exit(0)

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    header("Logix Plus Solutions — Launcher")

    # 1. Verify npm is available
    check_npm()

    # 2. Install dependencies if needed
    header("Checking dependencies")
    if needs_install(SERVER_DIR):
        npm_install(SERVER_DIR, "server")
    else:
        log("Server dependencies already installed.")

    if needs_install(CLIENT_DIR):
        npm_install(CLIENT_DIR, "client")
    else:
        log("Client dependencies already installed.")

    # 3. Start backend server
    header("Starting servers")
    start_process([NPM, "run", "dev"], SERVER_DIR, "Backend (port 3000)")

    # 4. Wait for backend
    if not wait_for_url(SERVER_URL, "Backend"):
        print("\n✗  Backend did not start within timeout.")
        print("   Check that .env is configured in server/")
        shutdown()

    # 5. Start frontend
    start_process([NPM, "run", "dev"], CLIENT_DIR, "Frontend (port 5173)")

    # 6. Wait for frontend then open browser
    if wait_for_url(CLIENT_URL, "Frontend"):
        header("Opening browser")
        log(f"Opening {CLIENT_URL}")
        webbrowser.open(CLIENT_URL)
    else:
        print("\n✗  Frontend did not start within timeout.")
        shutdown()

    # 7. Keep running — Ctrl+C to stop
    header("App is running")
    log(f"Frontend : {CLIENT_URL}")
    log(f"Backend  : {SERVER_URL}")
    log("")
    log("Press Ctrl+C to stop all servers.")
    print()

    try:
        while True:
            # Restart either server if it crashed
            for p in list(processes):
                if p.poll() is not None:
                    log("A server process exited unexpectedly. Shutting down.")
                    shutdown()
            time.sleep(3)
    except KeyboardInterrupt:
        shutdown()
