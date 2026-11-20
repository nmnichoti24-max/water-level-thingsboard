import { respondAuth } from '../server/auth.js'

export default function handler(req, res) {
  return respondAuth(req, res, process.env)
}
