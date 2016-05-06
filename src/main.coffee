fs = require 'fs'
path = require 'path'
QuickGraph = require './quickgraph'

main = ->
  aliases = {}

  for d in ['HOME', 'USERPROFILE']
    dir = process.env[d]
    filename = path.join(dir, '.quickgraphrc')
    if fs.existsSync(filename)
      lines = String(fs.readFileSync(filename)).split(/[\r\n]/)
      for line in lines
        if matches = line.match(/^(\S+)\s+(.+)$/)
          aliases[matches[1]] = matches[2]

  # console.log aliases

  qg = new QuickGraph(aliases)
  args = process.argv.slice(2)
  if args.length == 0
    args = ['-h']
  if not qg.parseArguments(args)
    if qg.error
      console.log "Parse error: #{qg.error}"
    return false

  if not qg.execute()
    err = qg.error ? "Unknown"
    console.log "Execute error: #{err}"
    return false

  return qg.generate()

module.exports = main
