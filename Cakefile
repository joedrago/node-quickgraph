fs = require 'fs'
path = require 'path'
{spawn} = require 'child_process'
util = require 'util'

coffeeName = 'coffee'
if process.platform == 'win32'
  coffeeName += '.cmd'

buildTool = (callback) ->
  coffee = spawn coffeeName, ['-c', '-o', 'build', 'src']
  coffee.stderr.on 'data', (data) ->
    process.stderr.write data.toString()
    process.exit(-1)
  coffee.stdout.on 'data', (data) ->
    print data.toString()
  coffee.on 'exit', (code) ->
    util.log "quickgraph compilation finished."
    callback?() if code is 0

task 'build', 'build JS bundle', (options) ->
  buildTool ->
