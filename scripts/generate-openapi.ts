import { writeFile } from 'node:fs/promises'
import { auth } from '../src/lib/auth'

const schema = await auth.api.generateOpenAPISchema()
await writeFile('openapi.json', `${JSON.stringify(schema, null, 2)}\n`)

console.log('openapi.json written')
