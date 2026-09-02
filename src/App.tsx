/**
 * 应用壳：左侧菜单 + 顶栏标题 + 内容区 Outlet。
 * 菜单 key 就是路由 path，点击后 navigate。
 */
import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Layout, Menu, Typography } from 'antd'
import {
  DashboardOutlined,
  TeamOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import './App.css'

const { Header, Sider, Content } = Layout

const menuItems: MenuProps['items'] = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/members', icon: <TeamOutlined />, label: '成员管理' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
]

const titles: Record<string, string> = {
  '/dashboard': '工作台',
  '/members': '成员管理',
  '/settings': '系统设置',
}

function App() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <Layout className="app-layout">
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
      >
        <div className="app-logo">{collapsed ? 'RT' : 'React Table'}</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Typography.Title level={4} className="app-title">
            {titles[location.pathname]}
          </Typography.Title>
        </Header>
        <Content className="app-content">
          <div className="app-card">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
