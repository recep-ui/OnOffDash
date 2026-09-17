import os
import time
import threading
from app.config import TEMP_DIR, OUTPUT_DIR, TTL_MINUTES

def cleanup_daemon_loop():
    """
    Background daemon loop that removes files older than TTL_MINUTES
    from temp and output directories.
    """
    print(f"File Service: Started cleanup daemon loop (TTL: {TTL_MINUTES} minutes).", flush=True)
    while True:
        try:
            now = time.time()
            ttl_threshold_seconds = TTL_MINUTES * 60
            
            for folder in [TEMP_DIR, OUTPUT_DIR]:
                if not os.path.exists(folder):
                    continue
                
                for filename in os.listdir(folder):
                    file_path = os.path.join(folder, filename)
                    if os.path.isfile(file_path):
                        mtime = os.path.getmtime(file_path)
                        # If file is older than TTL, remove it
                        if (now - mtime) > ttl_threshold_seconds:
                            try:
                                os.remove(file_path)
                                print(f"File Service: Cleaned up expired file {file_path}", flush=True)
                            except Exception as e:
                                print(f"File Service: Error cleaning up file {file_path}: {e}", flush=True)
        except Exception as ex:
            print(f"File Service: Exception in cleanup daemon: {ex}", flush=True)
            
        time.sleep(300) # Check every 5 minutes

def start_cleanup_daemon():
    cleanup_thread = threading.Thread(target=cleanup_daemon_loop, daemon=True)
    cleanup_thread.start()
