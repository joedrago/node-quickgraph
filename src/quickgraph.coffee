fs = require 'fs'
CoffeeScript = require 'coffee-script'
XRegExp = require 'xregexp'
shellParse = require('shell-quote').parse

class LineReader
  constructor: (@filename) ->
    @BUFFER_SIZE = 1024 * 1024
    @fd = fs.openSync @filename, 'r'
    @lines = []
    @lineFragment = ''
    @eof = false

  nextLine: ->
    if @lines.length == 0
      if @eof
        return null
      buffer = new Buffer @BUFFER_SIZE
      bytesRead = fs.readSync @fd, buffer, 0, @BUFFER_SIZE, null
      @lines = buffer.toString('utf8', 0, bytesRead).split(/(?:\n|\r\n|\r)/g)
      @lines[0] = @lineFragment + @lines[0]
      @lineFragment = @lines.pop() || ''
      if bytesRead != @BUFFER_SIZE
        @eof = true
      if @lines.length == 0
        return null

    return @lines.shift()

class Bucket
  constructor: ->
    @min = null
    @max = null
    @last = null
    @sum = 0
    @count = 0
  add: (v) ->
    if (@min == null) or (@min > v)
      @min = v
    if (@max == null) or (@max <  v)
      @max = v
    @last = v
    @sum += v
    @count += 1
  avg: ->
    return 0 if @count == 0
    return @sum / @count

  consolidate: (how) ->
    switch how
      when 'sum'   then return @sum
      when 'count' then return @count
      when 'avg'   then return @avg()
      when 'min'   then return @min
      when 'max'   then return @max
      when 'last'  then return @last
    return @sum

class QuickGraph
  constructor: (@aliases) ->
    @error = null
    @inputFilenames = []
    @graphs = []
    @defaultEval = @compile("parseFloat(@V)")
    @DEFAULT_OUTPUT_FILENAME = "quickgraph.html"
    @outputFilename = @DEFAULT_OUTPUT_FILENAME
    @verboseEnabled = false

  syntax: ->
    console.error "Syntax: qg [options] logfile [... logfile]"
    console.error "Options:"
    console.error "        -h,--help                  This help output"
    console.error "        -v,--verbose               Verbose mode"
    console.error "        -o,--output FILENAME       Output filename (default: #{@DEFAULT_OUTPUT_FILENAME})"
    console.error "        -a,--alias ALIAS           Use named alias from your home directory's .quickgraphrc"
    console.error "        -g,--graph                 Begin a new graph. This is not necessary if you're only making one"
    console.error "        -t,--title TITLE           Sets the title of the current graph"
    console.error "        -x REGEX                   Matches a new X axis value, parsed by -e, formatted with -f or -F"
    console.error "        -y REGEX                   Matches a new Y axis value, parsed by -e, formatted with -f or -F"
    console.error "        -l,--legend LEGEND         Sets the legend for the current axis"
    console.error "        -c,--consolidate FUNC      Sets the consolidation function for the current axis (sum, count, avg, min, max, last)"
    console.error "        -e,--eval CODE             Sets the evaluator for the axis regex's output. See examples"
    console.error "        -f,--format CODE           Sets the code used to format an x axis value"
    console.error "        --height                   Sets the graph's height. Defaults to 480."
    return

  compile: (func) ->
    return CoffeeScript.compile(func, { bare: true })

  fail: (reason) ->
    @error = reason
    return false

  newGraph: (index) ->
    return {
      title: "Graph #{index}"
      rules:
        x: []
        y: []
      charts: []
      xlabels: {}
      size:
        height: 480
    }

  newRule: (axis, index, regex) ->
    return {
      legend: "#{axis}#{index}"
      regex: regex
      consolidate: 'sum'
      buckets: {}
      eval: @defaultEval
    }

  currentGraph: ->
    if @graphs.length == 0
      @graphs.push @newGraph(@graphs.length)
    return @graphs[@graphs.length - 1]

  currentRule: (axis) ->
    currentGraph = @currentGraph()
    if currentGraph.rules[axis].length == 0
      return null
    return currentGraph.rules[axis][currentGraph.rules[axis].length - 1]

  parseArguments: (args) ->
    lastAxis = 'x'
    while arg = args.shift()
      switch arg
        when '-h', '--help'
          @syntax()
          return false

        when '-v', '--verbose'
          console.log "Verbose mode enabled."
          @verboseEnabled = true

        when '-o', '--output'
          unless output = args.shift()
            return @fail("-o requires an argument")
          @outputFilename = output

        when '-a', '--alias'
          unless alias = args.shift()
            aliasList = Object.keys(@aliases).sort()
            console.log "Aliases: (#{aliasList.length})"
            for alias in aliasList
              spaces = ""
              spacesToCreate = 20 - alias.length
              while spacesToCreate > 0
                spacesToCreate -= 1
                spaces += " "
              console.log "* #{alias}#{spaces}#{@aliases[alias]}"
            return false
          if not @aliases.hasOwnProperty(alias)
            return @fail("Unknown alias '#{alias}'")
          aliasArgs = shellParse(@aliases[alias])
          if @verboseEnabled
            console.log "expanded alias '#{alias}': ", aliasArgs
          for arg in args
            aliasArgs.push arg
          args = aliasArgs

        when '-g', '--graph'
          @graphs.push @newGraph(@graphs.length)

        when '-t', '--title'
          currentGraph = @currentGraph()
          unless title = args.shift()
            return @fail("-t requires an argument")
          currentGraph.title = title

        when '--height'
          currentGraph = @currentGraph()
          unless height = args.shift()
            return @fail("--height requires an argument")
          currentGraph.size.height = height

        when '-x', '-y'
          axis = arg.charAt(1)
          lastAxis = axis
          unless regex = args.shift()
            return @fail("-x requires an argument")
          try
            xregex = XRegExp(regex)
          catch error
            return @fail("regex failure: #{error}")
          currentGraph = @currentGraph()
          rule = @newRule(axis, currentGraph.rules[axis].length, xregex)
          currentGraph.rules[axis].push rule

        when '-f', '--format'
          currentGraph = @currentGraph()
          unless format = args.shift()
            return @fail("-f requires an argument")
          currentGraph.format = format

        when '-l', '--legend'
          unless legend = args.shift()
            return @fail("-l requires an argument")
          unless rule = @currentRule(lastAxis)
            return @fail("-l must modify an axis created with -x or -y")
          rule.legend = legend

        when '-c', '--consolidate'
          unless consolidate = args.shift()
            return @fail("-c requires an argument")
          unless rule = @currentRule(lastAxis)
            return @fail("-c must modify an axis created with -x or -y")
          rule.consolidate = consolidate

        when '-e', '--eval', '--evaluator'
          unless evaluator = args.shift()
            return @fail("-e requires an argument")
          unless rule = @currentRule(lastAxis)
            return @fail("-e must modify an axis created with -x or -y")
          rule.eval = @compile(evaluator)

        else
          if matches = arg.match(/^@(.+)/)
            responseFilename = matches[1]
            if not fs.existsSync(responseFilename)
              return @fail("Response filename '#{responseFilename}' does not exist")
            responseFileReader = new LineReader(responseFilename)
            extraArgs = []
            while (argsLine = responseFileReader.nextLine()) != null
              parsedArgs = shellParse(argsLine)
              for arg in parsedArgs
                extraArgs.push arg
            for arg in args
              extraArgs.push arg
            args = extraArgs
          else
            @inputFilenames.push arg

    return true

  evalInContext: (js, context) ->
    return (->
      return eval(js)
    ).call(context)

  addToBucket: (rule, x, y) ->
    rule.buckets[x] ?= new Bucket()
    rule.buckets[x].add(y)

  isEmptyObject: (obj) ->
    for k of obj
      return false
    return true

  execute: ->
    # Validation
    if @inputFilenames.length < 1
      return @fail("no filenames to read")
    if @graphs.length == 0
      return @fail("no graphs requested")

    for inputFilename in @inputFilenames
      if not fs.existsSync(inputFilename)
        return @fail("Filename '#{inputFilename}' does not exist")

    # console.log "inputFilenames: ", @inputFilenames
    # console.log "graphs:", JSON.stringify(@graphs, null, 2)

    flatRules = []
    for graph in @graphs
      for axis in ['x', 'y'] # Explicit ordering. x axis must always parse first
        rules = graph.rules[axis]
        if rules.length == 0
          return @fail("Graph '#{graph.title}' has no #{axis} axis rules")
        for rule in rules
          rule.axis = axis
          rule.graph = graph
          flatRules.push rule

    for inputFilename in @inputFilenames
      reader = new LineReader(inputFilename)
      lastX = 0
      lineCount = 0
      while (line = reader.nextLine()) != null
        lineCount += 1
        if (lineCount % 100000) == 0
          console.log "(#{inputFilename}) Parsed #{lineCount} lines."
        for rule in flatRules
          if matches = XRegExp.exec(line, rule.regex)
            context = { V: matches[0], f: {} }
            for v, i in matches
              if (matches.length == 2) and (i == 1)
                context.V = v
              context["V#{i}"] = v
              context.f["V#{i}"] = parseFloat(v)
            for k, v of matches
              if k.match(/^[A-Z]/)
                context[k] = v
                context.f[k] = parseFloat(v)
            if @verboseEnabled
              console.log "parsed #{rule.axis} rule, context: ", context
              console.log "Running JS:\n#{rule.eval}"
            v = @evalInContext(rule.eval, context)
            if @verboseEnabled
              console.log "result: #{v}"
            if rule.axis == 'x'
              lastX = v
              graph.xlabels[lastX] = context.V
            else
              @addToBucket(rule, lastX, v)
      console.log "(#{inputFilename}) Parsed #{lineCount} lines."

    for graph in @graphs
      xindices = {}
      for rule in graph.rules.y
        for k of rule.buckets
          xindices[k] = true

      columns = [ ['x'] ]
      for rule in graph.rules.y
        continue if @isEmptyObject(rule.buckets)
        columns.push [rule.legend]

      xvalues = Object.keys(xindices).map( (e) -> parseFloat(e) ).sort (a, b) -> a - b
      for x in xvalues
        columnIndex = 0
        columns[columnIndex].push x
        for rule in graph.rules.y
          continue if @isEmptyObject(rule.buckets)
          columnIndex += 1
          v = 0
          if rule.buckets[x]?
            v = rule.buckets[x].consolidate(rule.consolidate)
          columns[columnIndex].push v

      if @verboseEnabled
        console.log "(graph: #{graph.title}) Found #{xvalues.length} values for the X axis."

      graph.chart =
        zoom:
          enabled: true
        data:
          # type: 'bar'
          x: 'x'
          columns: columns
        axis:
          x:
            tick: {}
        size: graph.size

      format = null
      if graph.format
        graph.chart.axis.x.tick.format = "function formatXAxis(v) { return #{graph.format} }"
      else
        graph.chart.xlabels = graph.xlabels
        graph.chart.axis.x.tick.format = "function formatXAxis(v) { return this.xlabels[v] }"
      # console.log JSON.stringify(graph.chart, null, 2)

    return true

  generate: ->

    charts = []

    for graph in @graphs
      charts.push graph.chart

    html = """
      <html>
      <head>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/c3/0.4.10/c3.min.css" rel="stylesheet" type="text/css">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.16/d3.min.js" charset="utf-8"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/c3/0.4.10/c3.min.js"></script>
      </head>
      <body>
      <div id='charts'></div>
      <script>
        var charts = #{JSON.stringify(charts, null, 2)};
        var i;
        for (i = 0; i < charts.length; i++) {
          var d = document.createElement('div');
          d.id = "chart" + i;
          document.getElementById("charts").appendChild(d);

          var chart = charts[i];
          chart.bindto = "#" + d.id;
          if(chart.axis.x.tick.format) {
            eval(chart.axis.x.tick.format);
            chart.axis.x.tick.format = formatXAxis.bind(chart);
          }
          c3.generate(chart);
        }
      </script>
      </body>
      </html>
    """
    fs.writeFileSync(@outputFilename, html)
    console.log "Wrote #{@outputFilename}"

module.exports = QuickGraph
