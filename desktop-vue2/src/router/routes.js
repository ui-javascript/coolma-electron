
const routes = [
  {
    path: '/',
    component: () => import('components/layout/MainLayout.vue'),
    children: [
      { path: '', component: () => import('pages/Index.vue') }
    ]
  }
]

export default routes
