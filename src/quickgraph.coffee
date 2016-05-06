fs = require 'fs'
CoffeeScript = require 'coffee-script'
XRegExp = require 'xregexp'

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
      @lines = String(buffer).split(/(?:\n|\r\n|\r)/g)
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

  syntax: ->
    console.error "Syntax: qg [options] logfile [... logfile]\n"
    console.error "Options:"
    console.error "        -h,--help                  This help output"
    console.error "        -o,--output FILENAME       Output filename (default: #{@DEFAULT_OUTPUT_FILENAME})"
    console.error "        -a,--alias ALIAS           Use named alias from your home directory's .quickgraphrc"
    console.error "        -g,--graph                 Begin a new graph. This is not necessary if you're only making one"
    console.error "        -t,--title TITLE           Sets the title of the current graph"
    console.error "        -x REGEX                   Matches a new X axis value, parsed by -e, formatted with -f or -F"
    console.error "        -y REGEX                   Matches a new Y axis value, parsed by -e, formatted with -f or -F"
    console.error "        -l,--legend LEGEND         Sets the legend for the current axis"
    console.error "        -c,--consolidate FUNC      Sets the consolidation function for the current axis (sum, count, avg, min, max, last)"
    console.error "        -e,--eval CODE             Sets the evaluator for the axis regex's output. See examples"
    console.error "        -f,--format FORMAT         Sets a C3 timeseries format for the X axis"
    console.error "        -F,--format-function CODE  Sets the code used to interpret a JS Date object for the X axis"
    return

  compile: (func) ->
    return CoffeeScript.compile(func, { bare: true })

  # Adapted from NPM's string-argv
  stringToArgs: (value) ->
    # ([^\s'"]+(['"])([^\2]*?)\2) Match `text"quotes text"`

    # [^\s'"] or Match if not a space ' or "

    # (['"])([^\4]*?)\4 or Match "quoted text" without quotes
    # `\2` and `\4` are a backreference to the quote style (' or ") captured
    myRegexp = /([^\s'"]+(['"])([^\2]*?)\2)|[^\s'"]+|(['"])([^\4]*?)\4/gi
    myString = value
    myArray = []
    loop
      # Each call to exec returns the next regex match as an array
      if match = myRegexp.exec(myString)
        # Index 1 in the array is the captured group if it exists
        # Index 0 is the matched text, which we use if no captured group exists
        myArray.push(match[1] || match[5] || match[0])
      else
        break

    return myArray

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

        when '-o', '--output'
          unless output = args.shift()
            return @fail("-o requires an argument")
          @outputFilename = output

        when '-a', '--alias'
          unless alias = args.shift()
            return @fail("-a requires an argument")
          if not @aliases.hasOwnProperty(alias)
            return @fail("Unknown alias '#{alias}'")
          aliasArgs = @stringToArgs(@aliases[alias])
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

        when '-F', '--format-function'
          currentGraph = @currentGraph()
          unless formatFunc = args.shift()
            return @fail("-F requires an argument")
          currentGraph.formatFunc = formatFunc

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
      for axis, rules of graph.rules
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
      while line = reader.nextLine()
        lineCount += 1
        if (lineCount % 100000) == 0
          console.log "(#{inputFilename}) Parsed #{lineCount} lines."
        for rule in flatRules
          if matches = XRegExp.exec(line, rule.regex)
            context = { V: matches[0], f: {} }
            for v, i in matches
              context["V#{i}"] = v
              context.f["V#{i}"] = parseFloat(v)
            for k, v of matches
              if k.match(/^[A-Z]/)
                context[k] = v
                context.f[k] = parseFloat(v)
            v = @evalInContext(rule.eval, context)
            if rule.axis == 'x'
              lastX = v
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

      graph.chart =
        data:
          x: 'x'
          columns: columns

      format = null
      formatFunc = false
      if graph.formatFunc
        format = "function formatXAxis(t) { return #{graph.formatFunc} }"
        formatFunc = true
      else if graph.format
        format = graph.format

      if format
        graph.chart.formatFunc = formatFunc
        graph.chart.axis =
          x:
            type: 'timeseries'
            tick:
              format: format
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
          if(chart.formatFunc) {
            eval(chart.axis.x.tick.format);
            chart.axis.x.tick.format = formatXAxis;
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
