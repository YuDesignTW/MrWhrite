// Shared by the CLI and subprocess tests; no production-data or runner overrides.
export function installShutdown({ server, runtime, release, closeDev = () => {}, timeoutMs = 5000 }) {
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      release();
      process.exit(1);
    }, timeoutMs);
    try {
      const drained = new Promise((resolve) => server.close(resolve));
      server.closeIdleConnections();
      await Promise.all([drained, runtime.close(), closeDev()]);
      release();
      clearTimeout(deadline);
      process.exit(0);
    } catch (error) {
      console.error('服務關閉失敗：', error.message);
      release();
      clearTimeout(deadline);
      process.exit(1);
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return shutdown;
}
