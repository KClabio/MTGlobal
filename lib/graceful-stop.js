// Stopping the site cleanly (an update, a host restart): no new visits, the visits being answered finish, then the
// database connection closes. If something hangs, the time limit ends it anyway, so an update never gets stuck.
const STOP_LIMIT_MS = 10000;

function gracefulStop({ server, closeDb = async () => {}, timeoutMs = STOP_LIMIT_MS, exit = process.exit }) {
  let stopping = false;
  return function stop() {
    if (stopping) return;
    stopping = true;
    const limit = setTimeout(() => exit(1), timeoutMs);
    limit.unref();
    server.close(async () => {
      try { await closeDb(); } catch (err) { console.error('Closing the database:', err.message); }
      clearTimeout(limit);
      exit(0);
    });
    server.closeIdleConnections(); // browsers keep connections open between pages
  };
}

/** SIGTERM / SIGINT, and PM2's "shutdown" message: where signals can't be caught (Windows), PM2 sends that instead */
function stopOnSignals(stop, proc = process) {
  proc.once('SIGTERM', stop);
  proc.once('SIGINT', stop);
  if (proc.send) proc.on('message', (message) => { if (message === 'shutdown') stop(); });
}

module.exports = { gracefulStop, stopOnSignals, STOP_LIMIT_MS };
