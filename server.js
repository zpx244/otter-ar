import express from 'express'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = join(__filename, '..')

const app = express()
app.use(express.static(join(__dirname, 'dist')))

app.listen(80, () => {
  console.log('✅ Server running at http://your-domain.com')
})