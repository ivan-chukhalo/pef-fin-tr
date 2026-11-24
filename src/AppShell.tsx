import { lazy, Suspense, useState, type ReactNode } from 'react'
import { HashRouter, Link, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import AccountsPage from './accounts/AccountsPage'
import HomePage from './home/HomePage'
import { formatDateTimeInKyiv } from './lib/dates'
import type { OfflinePageProps, OfflineSnapshot } from './offline/snapshot'
import type { OfflineWorkerStatus } from './offline/useOfflineWorker'
import { recurringPath } from './recurring/data'

const CategoriesPage = lazy(() => import('./categories/CategoriesPage'))
const AnalyticsPage = lazy(() => import('./analytics/AnalyticsPage'))
const TransactionsPage = lazy(() => import('./transactions/TransactionsPage'))
const TransactionEditorPage = lazy(() => import('./transactions/TransactionEditorPage'))
const TransferPage = lazy(() => import('./transfers/TransferPage'))
const PlannedOperationsPage = lazy(() => import('./transactions/PlannedOperationsPage'))
const RecurringTemplatesPage = lazy(() => import('./recurring/RecurringTemplatesPage'))
const RecurringEditorPage = lazy(() => import('./recurring/RecurringEditorPage'))
const ForecastPage = lazy(() => import('./forecast/ForecastPage'))
const BackupDownload = lazy(() => import('./settings/BackupDownload'))
const BackupRestore = lazy(() => import('./settings/BackupRestore'))
const MonobankPage = lazy(() => import('./monobank/MonobankPage'))

const home = { path: '/', label: 'Головна' }
const transactions = { path: '/transactions', label: 'Транзакції' }
const analytics = { path: '/analytics', label: 'Аналітика' }
const forecast = { path: '/more/forecast', label: 'Прогноз' }
const accounts = { path: '/more/accounts', label: 'Рахунки' }
const categories = { path: '/more/categories', label: 'Категорії' }
const settings = { path: '/more/settings', label: 'Налаштування' }
const additionalSections = [
  forecast,
  accounts,
  categories,
  settings,
]
const sections = [home, transactions, analytics, ...additionalSections]
const more = { path: '/more', label: 'Ще' }
const addTransaction = { path: '/transactions/new', label: 'Додати транзакцію' }
const transfer = { path: '/transactions/transfer', label: 'Переказ' }
const planned = { path: '/transactions/planned', label: 'Заплановані' }
const monobank = { path: '/transactions/monobank', label: 'Підтягнути з monobank' }

const focusClass = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300'
const sidebarLinkClass = `flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800/80 hover:text-zinc-100 aria-[current=page]:bg-emerald-300/10 aria-[current=page]:text-emerald-200 ${focusClass}`
const mobileLinkClass = `flex min-h-12 items-center justify-center rounded-lg px-0.5 text-center text-xs font-medium text-zinc-300 hover:bg-zinc-800 aria-[current=page]:bg-emerald-300/10 aria-[current=page]:text-emerald-200 ${focusClass}`

function BrandLink() {
  return (
    <Link to={home.path} className={`inline-flex rounded-sm text-base font-semibold tracking-tight ${focusClass}`}>
      Персональні фінанси
    </Link>
  )
}

function DesktopNavigation() {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-900 px-4 py-6 md:flex">
      <div className="mb-8 px-4">
        <BrandLink />
      </div>
      <nav aria-label="Основна навігація" className="grid gap-1">
        {sections.map(({ path, label }) => (
          <NavLink key={path} to={path} className={sidebarLinkClass}>
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

function MobileNavigation({ readOnly }: { readOnly: boolean }) {
  return (
    <nav
      aria-label="Нижня навігація"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-800 bg-zinc-900 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className={`mx-auto grid max-w-lg ${readOnly ? 'grid-cols-4' : 'grid-cols-5'} items-center gap-1 px-2 py-2`}>
        <NavLink to={home.path} className={mobileLinkClass}>
          {home.label}
        </NavLink>
        <NavLink to={transactions.path} className={mobileLinkClass}>
          {transactions.label}
        </NavLink>
        {!readOnly && (
          <NavLink
            to={addTransaction.path}
            aria-label={addTransaction.label}
            className={`mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-300 text-3xl leading-none text-zinc-950 transition-colors hover:bg-emerald-200 ${focusClass}`}
          >
            <span aria-hidden="true">+</span>
          </NavLink>
        )}
        <NavLink to={analytics.path} className={mobileLinkClass}>
          {analytics.label}
        </NavLink>
        <NavLink to={more.path} className={mobileLinkClass}>
          {more.label}
        </NavLink>
      </div>
    </nav>
  )
}

const readinessText = {
  preparing: 'Готуємо офлайн-доступ…',
  ready: 'Офлайн-доступ готовий',
  failed: 'Не вдалося підготувати офлайн-доступ. Онови сторінку з інтернетом.',
} satisfies Record<OfflineWorkerStatus, string>

function ShellLayout({ snapshot, offlineReadiness }: { snapshot?: OfflineSnapshot; offlineReadiness?: OfflineWorkerStatus }) {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100 md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <DesktopNavigation />
      <div className="min-w-0">
        <header className="flex min-h-16 items-center border-b border-zinc-800 px-4 md:hidden">
          <BrandLink />
        </header>
        <main className="mx-auto max-w-6xl px-4 pt-7 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 md:px-10 md:py-10">
          {offlineReadiness && (
            <p role="status" className="mb-2 text-xs text-zinc-400">{readinessText[offlineReadiness]}</p>
          )}
          {snapshot && (
            <p role="status" className="mb-4 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
              Офлайн · Дані станом на <time dateTime={snapshot.exported_at}>{formatDateTimeInKyiv(snapshot.exported_at)}</time>. Для внесення змін потрібен інтернет.
            </p>
          )}
          <Outlet />
        </main>
      </div>
      <MobileNavigation readOnly={!!snapshot} />
    </div>
  )
}

function SectionPage({
  title,
  action,
  children,
  showQuickAdd = true,
}: {
  title: string
  action?: ReactNode
  children?: ReactNode
  showQuickAdd?: boolean
}) {
  return (
    <section>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-5 md:pb-6">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        <div className="flex flex-wrap items-center gap-3">
          {action}
          {showQuickAdd && (
            <Link
              to={addTransaction.path}
              className={`hidden h-11 items-center gap-2 rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-200 md:inline-flex ${focusClass}`}
            >
              <span aria-hidden="true" className="text-xl leading-none">+</span>
              {addTransaction.label}
            </Link>
          )}
        </div>
      </header>
      <Suspense fallback={<p role="status" className="mt-6 text-sm text-zinc-400">Завантажуємо розділ…</p>}>
        {children}
      </Suspense>
    </section>
  )
}

function OnlineAction({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  const [hasOpened, setHasOpened] = useState(!readOnly)
  if (!hasOpened && !readOnly) setHasOpened(true)
  return (
    <>
      {readOnly && <p role="status" className="mt-6 text-sm text-zinc-400">Підключися до інтернету, щоб внести зміни.</p>}
      {hasOpened && <fieldset disabled={readOnly} className="min-w-0">{children}</fieldset>}
    </>
  )
}

export default function AppShell({ client, snapshot, offlineReadiness }: OfflinePageProps & { offlineReadiness?: OfflineWorkerStatus }) {
  const readOnly = !!snapshot
  const pageProps = { client, snapshot }
  return (
    <HashRouter>
      <Routes>
        <Route element={<ShellLayout snapshot={snapshot} offlineReadiness={offlineReadiness} />}>
          {sections.map(({ path, label }) => (
            <Route
              key={path}
              path={path}
              element={
                <SectionPage
                  title={label}
                  showQuickAdd={!readOnly}
                  action={path === transactions.path && (readOnly ? [planned] : [planned, transfer, monobank]).map(({ path, label }) => (
                    <Link key={path} to={path} className={`inline-flex h-11 items-center rounded-xl border border-zinc-700 px-4 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800 ${focusClass}`}>
                      {label}
                    </Link>
                  ))}
                >
                  {path === home.path && <HomePage {...pageProps} />}
                  {path === analytics.path && <AnalyticsPage {...pageProps} />}
                  {path === forecast.path && <ForecastPage {...pageProps} />}
                  {path === accounts.path && <AccountsPage {...pageProps} />}
                  {path === categories.path && <CategoriesPage {...pageProps} />}
                  {path === transactions.path && <TransactionsPage {...pageProps} />}
                  {path === settings.path && (
                    <div className="mt-6 space-y-4">
                      <dl className="max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                        <dt className="text-sm text-zinc-400">Основна валюта</dt>
                        <dd className="mt-1 font-medium">Гривня (UAH)</dd>
                      </dl>
                      <Link to={categories.path} className={`inline-flex min-h-11 items-center rounded-xl border border-zinc-700 px-4 text-sm font-medium hover:bg-zinc-800 ${focusClass}`}>
                        Керувати категоріями
                      </Link>
                      {!readOnly && <BackupDownload client={client} />}
                      {!readOnly && <BackupRestore client={client} />}
                    </div>
                  )}
                </SectionPage>
              }
            />
          ))}
          <Route
            path={addTransaction.path}
            element={
              <SectionPage title={addTransaction.label} showQuickAdd={false}>
                <OnlineAction readOnly={readOnly}><TransactionEditorPage client={client} /></OnlineAction>
              </SectionPage>
            }
          />
          <Route
            path="/transactions/:transactionId/edit"
            element={
              <SectionPage title="Редагувати транзакцію" showQuickAdd={!readOnly}>
                <OnlineAction readOnly={readOnly}><TransactionEditorPage client={client} /></OnlineAction>
              </SectionPage>
            }
          />
          <Route
            path="/transactions/:transactionId/confirm"
            element={
              <SectionPage title="Підтвердити транзакцію" showQuickAdd={false}>
                <OnlineAction readOnly={readOnly}><TransactionEditorPage client={client} confirming /></OnlineAction>
              </SectionPage>
            }
          />
          <Route
            path={transfer.path}
            element={
              <SectionPage title={transfer.label} showQuickAdd={!readOnly}>
                <OnlineAction readOnly={readOnly}><TransferPage client={client} /></OnlineAction>
              </SectionPage>
            }
          />
          <Route
            path={planned.path}
            element={
              <SectionPage title={planned.label} showQuickAdd={false}>
                <PlannedOperationsPage {...pageProps} />
              </SectionPage>
            }
          />
          <Route
            path={monobank.path}
            element={
              <SectionPage title="Імпорт із monobank" showQuickAdd={false}>
                <OnlineAction readOnly={readOnly}><MonobankPage client={client} /></OnlineAction>
              </SectionPage>
            }
          />
          <Route
            path={recurringPath}
            element={
              <SectionPage title="Повторювані операції" showQuickAdd={false}>
                <RecurringTemplatesPage {...pageProps} />
              </SectionPage>
            }
          />
          <Route
            path={`${recurringPath}/new`}
            element={
              <SectionPage title="Додати шаблон" showQuickAdd={false}>
                <OnlineAction readOnly={readOnly}><RecurringEditorPage client={client} /></OnlineAction>
              </SectionPage>
            }
          />
          <Route
            path={`${recurringPath}/:templateId/edit`}
            element={
              <SectionPage title="Редагувати шаблон" showQuickAdd={false}>
                <OnlineAction readOnly={readOnly}><RecurringEditorPage client={client} /></OnlineAction>
              </SectionPage>
            }
          />
          <Route
            path={more.path}
            element={
              <SectionPage title={more.label} showQuickAdd={!readOnly}>
                <nav aria-label="Додаткові розділи" className="mt-6 grid max-w-sm gap-1 rounded-2xl border border-zinc-800 bg-zinc-900 p-2">
                  {additionalSections.map(({ path, label }) => (
                    <NavLink key={path} to={path} className={sidebarLinkClass}>
                      {label}
                    </NavLink>
                  ))}
                </nav>
              </SectionPage>
            }
          />
          <Route path="*" element={<Navigate to={home.path} replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
