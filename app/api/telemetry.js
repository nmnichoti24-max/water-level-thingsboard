import { respond } from '../server/telemetry.js'

export default function handler(req, res) {
  return respond(req, res, process.env)
}
