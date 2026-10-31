import { app } from 'electron'
import { configureUserData } from './lifecycle/user-data'

const smoke = process.argv.includes('--smoke')
configureUserData(smoke)
if (smoke) {
  void import('./diagnostics/smoke').then(({ runSmoke }) => runSmoke())
} else {
  void import('./lifecycle/main-log')
    .then(({ installMainLogger }) => {
      installMainLogger(app.getPath('logs'))
      return import('./lifecycle/start')
    })
    .catch((error) => {
      console.error('[sanas] main startup failed:', error)
      app.exit(1)
    })
}
