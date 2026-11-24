import '../index.css'

function activateWorker(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => finish(new Error('Service worker activation timed out')), 90_000)

    function finish(error?: Error) {
      clearTimeout(deadline)
      worker.removeEventListener('statechange', onStateChange)
      if (error) reject(error)
      else resolve()
    }

    function onStateChange() {
      if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' })
      if (worker.state === 'activated') finish()
      if (worker.state === 'redundant') finish(new Error('Service worker installation failed'))
    }

    worker.addEventListener('statechange', onStateChange)
    onStateChange()
  })
}

const button = document.querySelector<HTMLButtonElement>('#update-button')!
const status = document.querySelector<HTMLParagraphElement>('#update-status')!

button.addEventListener('click', async () => {
  button.disabled = true
  status.hidden = false
  status.textContent = 'Завантажуємо нову версію…'

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    await registration.update()

    const worker = registration.installing ?? registration.waiting ?? registration.active
    if (!worker) throw new Error('Service worker is unavailable')
    await activateWorker(worker)
    location.replace('/')
  } catch {
    status.textContent = 'Не вдалося оновити застосунок. Перевір підключення й спробуй ще раз.'
    button.disabled = false
  }
})
