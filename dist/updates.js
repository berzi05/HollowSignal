/** Keep the offline shell and the open page in sync without discarding unsaved forms. */
export function readWorkerStatus(worker) {
  return new Promise(resolve => {
    if (!worker) return resolve(null);
    const channel = new MessageChannel();
    const finish = value => { clearTimeout(timer); channel.port1.close(); resolve(value); };
    const timer = setTimeout(() => finish(null), 2000);
    channel.port1.onmessage = ({ data }) => finish(
      data?.type === 'HOLLOW_CACHE_STATUS' && /^v\d{1,6}$/.test(data.revision) && typeof data.ready === 'boolean' ? data : null
    );
    try { worker.postMessage({ type: 'HOLLOW_CACHE_STATUS' }, [channel.port2]); }
    catch { finish(null); }
  });
}

export function createUpdateMonitor({ serviceWorker, revision, onStatus, onUpdate, readStatus = readWorkerStatus, isOnline = () => navigator.onLine, now = () => Date.now() }) {
  let registration;
  let registrationTask;
  let checkTask;
  let sequence = 0;
  let lastCheck = -Infinity;
  let available = false;

  async function refresh() {
    const request = ++sequence, controller = serviceWorker.controller;
    const status = await readStatus(controller).catch(() => null);
    if (request !== sequence || controller !== serviceWorker.controller) return null;
    onStatus(status?.ready === true && status.revision === revision);
    // A fresh page can briefly have the previous worker. Never offer a downgrade.
    available = status?.ready === true && Number(status.revision.slice(1)) > Number(revision.slice(1));
    onUpdate(available);
    return status;
  }
  function register() {
    if (!registrationTask) registrationTask = serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(result => { registration = result; return result; })
      .catch(() => { onStatus(false); onUpdate(false); return null; })
      .finally(() => { registrationTask = null; });
    return registrationTask;
  }
  function check({ force = false } = {}) {
    if (checkTask) return checkTask;
    checkTask = (async () => {
      if (!isOnline()) { await refresh(); return 'offline'; }
      if (!force && now() - lastCheck < 60000) { await refresh(); return 'recent'; }
      lastCheck = now();
      const current = registration ?? await register();
      if (!current) return 'unavailable';
      try { await current.update(); }
      catch { await refresh(); return 'unavailable'; }
      const status = await refresh();
      if (available) return 'available';
      if (current.installing || current.waiting) return 'installing';
      return status?.ready && status.revision === revision ? 'current' : 'unverified';
    })().finally(() => { checkTask = null; });
    return checkTask;
  }
  serviceWorker.addEventListener('controllerchange', refresh);
  const ready = register().then(refresh);
  return { ready, refresh, check };
}
