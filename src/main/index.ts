import { app } from 'electron'
import { configureUserData } from './lifecycle/user-data'

const smoke = process.argv.includes('--smoke')
const rehearsal = process.argv.includes('--rehearsal')
if (!rehearsal) configureUserData(smoke)
if (rehearsal) {
  void import('./rehearsal/run').then(({ runRehearsal }) => runRehearsal()).catch(() => app.exit(1))
} else if (smoke) {
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
