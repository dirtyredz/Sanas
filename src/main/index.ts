import { app } from 'electron'
import { configureUserData } from './lifecycle/user-data'

const smoke = process.argv.includes('--smoke')
configureUserData(smoke)
if (smoke) {
  void import('./diagnostics/smoke').then(({ runSmoke }) => runSmoke())
} else {
  void import('./lifecycle/start').catch(() => app.exit(1))
}
