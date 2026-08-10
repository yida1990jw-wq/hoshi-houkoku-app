import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { to: '/', label: '報告一覧', end: true },
  { to: '/submission-status', label: '提出状況' },
  { to: '/publishers', label: '名簿' },
  { to: '/pioneer-progress', label: '開拓者進捗' },
  { to: '/reports', label: '帳票印刷' },
]

const ADMIN_NAV_ITEM = { to: '/staff', label: 'スタッフ管理', end: false }

export function Layout({ children }: { children: ReactNode }) {
  const { signOut, isAdmin } = useAuth()
  const navItems = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS

  return (
    <div className="app-shell">
      <header className="app-header">
        <nav className="app-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="link-button" onClick={signOut}>
          ログアウト
        </button>
      </header>
      <main>{children}</main>
    </div>
  )
}
