// Generated by CoffeeScript 1.10.0
(function() {
  var Bucket, CoffeeScript, LineReader, QuickGraph, XRegExp, fs, shellParse;

  fs = require('fs');

  CoffeeScript = require('coffee-script');

  XRegExp = require('xregexp');

  shellParse = require('shell-quote').parse;

  LineReader = (function() {
    function LineReader(filename) {
      this.filename = filename;
      this.BUFFER_SIZE = 1024 * 1024;
      this.fd = fs.openSync(this.filename, 'r');
      this.lines = [];
      this.lineFragment = '';
      this.eof = false;
    }

    LineReader.prototype.nextLine = function() {
      var buffer, bytesRead;
      if (this.lines.length === 0) {
        if (this.eof) {
          return null;
        }
        buffer = new Buffer(this.BUFFER_SIZE);
        bytesRead = fs.readSync(this.fd, buffer, 0, this.BUFFER_SIZE, null);
        this.lines = buffer.toString('utf8', 0, bytesRead).split(/(?:\n|\r\n|\r)/g);
        this.lines[0] = this.lineFragment + this.lines[0];
        this.lineFragment = this.lines.pop() || '';
        if (bytesRead !== this.BUFFER_SIZE) {
          this.eof = true;
        }
        if (this.lines.length === 0) {
          return null;
        }
      }
      return this.lines.shift();
    };

    return LineReader;

  })();

  Bucket = (function() {
    function Bucket() {
      this.min = null;
      this.max = null;
      this.last = null;
      this.sum = 0;
      this.count = 0;
    }

    Bucket.prototype.add = function(v) {
      if ((this.min === null) || (this.min > v)) {
        this.min = v;
      }
      if ((this.max === null) || (this.max < v)) {
        this.max = v;
      }
      this.last = v;
      this.sum += v;
      return this.count += 1;
    };

    Bucket.prototype.avg = function() {
      if (this.count === 0) {
        return 0;
      }
      return this.sum / this.count;
    };

    Bucket.prototype.consolidate = function(how) {
      switch (how) {
        case 'sum':
          return this.sum;
        case 'count':
          return this.count;
        case 'avg':
          return this.avg();
        case 'min':
          return this.min;
        case 'max':
          return this.max;
        case 'last':
          return this.last;
      }
      return this.sum;
    };

    return Bucket;

  })();

  QuickGraph = (function() {
    function QuickGraph(aliases) {
      this.aliases = aliases;
      this.error = null;
      this.inputFilenames = [];
      this.graphs = [];
      this.defaultXYEval = this.compile("parseFloat(@V)");
      this.defaultNoteEval = this.compile("@V");
      this.DEFAULT_OUTPUT_FILENAME = "quickgraph.html";
      this.outputFilename = this.DEFAULT_OUTPUT_FILENAME;
      this.verboseEnabled = false;
    }

    QuickGraph.prototype.syntax = function() {
      console.error("Syntax: qg [options] logfile [... logfile]");
      console.error("Options:");
      console.error("        -h,--help                  This help output");
      console.error("        -v,--verbose               Verbose mode");
      console.error("        -o,--output FILENAME       Output filename (default: " + this.DEFAULT_OUTPUT_FILENAME + ")");
      console.error("        -a,--alias ALIAS           Use named alias from your home directory's .quickgraphrc");
      console.error("        -g,--graph                 Begin a new graph. This is not necessary if you're only making one");
      console.error("        -t,--title TITLE           Sets the title of the current graph");
      console.error("        -x REGEX                   Matches a new X axis value, evaluated by -e, formatted with -f or -F");
      console.error("        -y REGEX                   Matches a new Y axis value, evaluated by -e, formatted with -f or -F");
      console.error("        -n REGEX                   Matches a new note, evaluated by -e");
      console.error("        -c,--color COLOR           Sets the color for the current rule (only makes sense on Y axis rules)");
      console.error("        -l,--legend LEGEND         Sets the legend for the current axis");
      console.error("        -e,--eval CODE             Sets the evaluator for the axis regex's output. See examples");
      console.error("        -f,--format CODE           Sets the code used to format an x axis value");
      console.error("        --consolidate FUNC         Sets the consolidation function for the current axis (sum, count, avg, min, max, last)");
      console.error("        --width                    Sets the graph's width. Defaults to use the whole width of the browser.");
      console.error("        --height                   Sets the graph's height. Defaults to 480.");
      console.error("        -A RESTOFLINE              Create a new alias (like in quickgraphrc) statement; only works in a response file");
    };

    QuickGraph.prototype.compile = function(func) {
      return CoffeeScript.compile(func, {
        bare: true
      });
    };

    QuickGraph.prototype.fail = function(reason) {
      this.error = reason;
      return false;
    };

    QuickGraph.prototype.newGraph = function(index) {
      return {
        index: index,
        title: "",
        rules: {
          x: [],
          y: [],
          n: []
        },
        charts: [],
        notes: [],
        xlabels: {},
        size: {
          height: 480
        }
      };
    };

    QuickGraph.prototype.newRule = function(axis, index, regex) {
      var rule;
      rule = {
        legend: "" + axis + index,
        regex: regex,
        consolidate: 'sum',
        buckets: {},
        "eval": this.defaultXYEval
      };
      if (axis === 'n') {
        rule["eval"] = this.defaultNoteEval;
      }
      return rule;
    };

    QuickGraph.prototype.currentGraph = function() {
      if (this.graphs.length === 0) {
        this.graphs.push(this.newGraph(this.graphs.length));
      }
      return this.graphs[this.graphs.length - 1];
    };

    QuickGraph.prototype.currentRule = function(axis) {
      var currentGraph;
      currentGraph = this.currentGraph();
      if (currentGraph.rules[axis].length === 0) {
        return null;
      }
      return currentGraph.rules[axis][currentGraph.rules[axis].length - 1];
    };

    QuickGraph.prototype.parseArguments = function(args) {
      var alias, aliasArgs, aliasLine, aliasList, arg, argsLine, axis, color, consolidate, currentGraph, error, error1, evaluator, extraArgs, format, height, j, l, lastAxis, legend, len, len1, len2, len3, m, matches, n, output, parsedArgs, regex, responseFileReader, responseFilename, rule, spaces, spacesToCreate, title, width, xregex;
      lastAxis = 'x';
      while (arg = args.shift()) {
        switch (arg) {
          case '-h':
          case '--help':
            this.syntax();
            return false;
          case '-v':
          case '--verbose':
            console.log("Verbose mode enabled.");
            this.verboseEnabled = true;
            break;
          case '-o':
          case '--output':
            if (!(output = args.shift())) {
              return this.fail("-o requires an argument");
            }
            this.outputFilename = output;
            break;
          case '-a':
          case '--alias':
            if (!(alias = args.shift())) {
              aliasList = Object.keys(this.aliases).sort();
              console.log("Aliases: (" + aliasList.length + ")");
              for (j = 0, len = aliasList.length; j < len; j++) {
                alias = aliasList[j];
                spaces = "";
                spacesToCreate = 20 - alias.length;
                while (spacesToCreate > 0) {
                  spacesToCreate -= 1;
                  spaces += " ";
                }
                console.log("* " + alias + spaces + this.aliases[alias]);
              }
              return false;
            }
            if (!this.aliases.hasOwnProperty(alias)) {
              return this.fail("Unknown alias '" + alias + "'");
            }
            aliasArgs = shellParse(this.aliases[alias]);
            if (this.verboseEnabled) {
              console.log("expanded alias '" + alias + "': ", aliasArgs);
            }
            for (l = 0, len1 = args.length; l < len1; l++) {
              arg = args[l];
              aliasArgs.push(arg);
            }
            args = aliasArgs;
            break;
          case '-g':
          case '--graph':
            this.graphs.push(this.newGraph(this.graphs.length));
            break;
          case '-t':
          case '--title':
            currentGraph = this.currentGraph();
            if (!(title = args.shift())) {
              return this.fail("-t requires an argument");
            }
            currentGraph.title = title;
            break;
          case '--width':
            currentGraph = this.currentGraph();
            if (!(width = args.shift())) {
              return this.fail("--width requires an argument");
            }
            currentGraph.size.width = width;
            break;
          case '--height':
            currentGraph = this.currentGraph();
            if (!(height = args.shift())) {
              return this.fail("--height requires an argument");
            }
            currentGraph.size.height = height;
            break;
          case '-x':
          case '-y':
          case '-n':
            axis = arg.charAt(1);
            lastAxis = axis;
            if (!(regex = args.shift())) {
              return this.fail("-x, -y, and -n require an argument");
            }
            try {
              xregex = XRegExp(regex);
            } catch (error1) {
              error = error1;
              return this.fail("regex failure: " + error);
            }
            currentGraph = this.currentGraph();
            rule = this.newRule(axis, currentGraph.rules[axis].length, xregex);
            currentGraph.rules[axis].push(rule);
            break;
          case '-f':
          case '--format':
            currentGraph = this.currentGraph();
            if (!(format = args.shift())) {
              return this.fail("-f requires an argument");
            }
            currentGraph.format = format;
            break;
          case '-l':
          case '--legend':
            if (!(legend = args.shift())) {
              return this.fail("-l requires an argument");
            }
            if (!(rule = this.currentRule(lastAxis))) {
              return this.fail("-l must modify an axis created with -x or -y");
            }
            rule.legend = legend;
            break;
          case '-c':
          case '--color':
            if (!(color = args.shift())) {
              return this.fail("-c requires an argument");
            }
            if (!(rule = this.currentRule(lastAxis))) {
              return this.fail("-c must modify an axis created with -x or -y");
            }
            rule.color = color;
            break;
          case '--consolidate':
            if (!(consolidate = args.shift())) {
              return this.fail("--consolidate requires an argument");
            }
            if (!(rule = this.currentRule(lastAxis))) {
              return this.fail("--consolidate must modify an axis created with -x or -y");
            }
            rule.consolidate = consolidate;
            break;
          case '-e':
          case '--eval':
          case '--evaluator':
            if (!(evaluator = args.shift())) {
              return this.fail("-e requires an argument");
            }
            if (!(rule = this.currentRule(lastAxis))) {
              return this.fail("-e must modify an axis created with -x or -y");
            }
            rule["eval"] = this.compile(evaluator);
            break;
          default:
            if (matches = arg.match(/^@(.+)/)) {
              responseFilename = matches[1];
              if (!fs.existsSync(responseFilename)) {
                return this.fail("Response filename '" + responseFilename + "' does not exist");
              }
              responseFileReader = new LineReader(responseFilename);
              extraArgs = [];
              while ((argsLine = responseFileReader.nextLine()) !== null) {
                if (matches = argsLine.match(/^\s*-A\s+(.+)$/)) {
                  aliasLine = matches[1];
                  if (matches = aliasLine.match(/^(\S+)\s+(.+)$/)) {
                    this.aliases[matches[1]] = matches[2];
                  }
                } else {
                  parsedArgs = shellParse(argsLine);
                  for (m = 0, len2 = parsedArgs.length; m < len2; m++) {
                    arg = parsedArgs[m];
                    extraArgs.push(arg);
                  }
                }
              }
              for (n = 0, len3 = args.length; n < len3; n++) {
                arg = args[n];
                extraArgs.push(arg);
              }
              args = extraArgs;
            } else {
              this.inputFilenames.push(arg);
            }
        }
      }
      return true;
    };

    QuickGraph.prototype.evalInContext = function(js, context) {
      return (function() {
        return eval(js);
      }).call(context);
    };

    QuickGraph.prototype.addToBucket = function(rule, x, y) {
      var base;
      if ((base = rule.buckets)[x] == null) {
        base[x] = new Bucket();
      }
      return rule.buckets[x].add(y);
    };

    QuickGraph.prototype.isEmptyObject = function(obj) {
      var k;
      for (k in obj) {
        return false;
      }
      return true;
    };

    QuickGraph.prototype.execute = function() {
      var axis, colors, columnIndex, columns, context, flatRules, graph, hasData, i, inputFilename, j, k, l, lastLabel, lastX, len, len1, len10, len11, len12, len2, len3, len4, len5, len6, len7, len8, len9, line, lineCount, lines, m, matches, n, note, o, p, q, r, reader, ref, ref1, ref2, ref3, ref4, ref5, ref6, ref7, ref8, rule, rules, s, t, u, v, w, x, xindices, xvalues, z;
      if (this.inputFilenames.length < 1) {
        return this.fail("no filenames to read");
      }
      if (this.graphs.length === 0) {
        return this.fail("no graphs requested");
      }
      ref = this.inputFilenames;
      for (j = 0, len = ref.length; j < len; j++) {
        inputFilename = ref[j];
        if (!fs.existsSync(inputFilename)) {
          return this.fail("Filename '" + inputFilename + "' does not exist");
        }
      }
      flatRules = [];
      ref1 = this.graphs;
      for (l = 0, len1 = ref1.length; l < len1; l++) {
        graph = ref1[l];
        ref2 = ['x', 'y', 'n'];
        for (m = 0, len2 = ref2.length; m < len2; m++) {
          axis = ref2[m];
          rules = graph.rules[axis];
          if ((rules.length === 0) && (axis !== 'n')) {
            return this.fail("Graph #" + graph.index + " ('" + graph.title + "') has no " + axis + " axis rules");
          }
          for (n = 0, len3 = rules.length; n < len3; n++) {
            rule = rules[n];
            rule.axis = axis;
            rule.graph = graph;
            flatRules.push(rule);
          }
        }
      }
      ref3 = this.inputFilenames;
      for (o = 0, len4 = ref3.length; o < len4; o++) {
        inputFilename = ref3[o];
        reader = new LineReader(inputFilename);
        lastX = 0;
        lastLabel = "";
        lineCount = 0;
        while ((line = reader.nextLine()) !== null) {
          lineCount += 1;
          if ((lineCount % 100000) === 0) {
            console.log("(" + inputFilename + ") Parsed " + lineCount + " lines.");
          }
          for (p = 0, len5 = flatRules.length; p < len5; p++) {
            rule = flatRules[p];
            if (matches = XRegExp.exec(line, rule.regex)) {
              context = {
                V: matches[0],
                f: {}
              };
              for (i = q = 0, len6 = matches.length; q < len6; i = ++q) {
                v = matches[i];
                if ((matches.length === 2) && (i === 1)) {
                  context.V = v;
                }
                context["V" + i] = v;
                context.f["V" + i] = parseFloat(v);
              }
              for (k in matches) {
                v = matches[k];
                if (k.match(/^[A-Z]/)) {
                  context[k] = v;
                  context.f[k] = parseFloat(v);
                }
              }
              if (this.verboseEnabled) {
                console.log("parsed " + rule.axis + " rule, context: ", context);
                console.log("Running JS:\n" + rule["eval"]);
              }
              v = this.evalInContext(rule["eval"], context);
              if (this.verboseEnabled) {
                console.log("result: " + v);
              }
              if (rule.axis === 'x') {
                lastX = v;
                lastLabel = context.V;
              } else if (rule.axis === 'y') {
                rule.graph.xlabels[lastX] = lastLabel;
                this.addToBucket(rule, lastX, v);
              } else {
                rule.graph.xlabels[lastX] = lastLabel;
                rule.graph.notes.push({
                  x: lastX,
                  text: v
                });
              }
            }
          }
        }
        console.log("(" + inputFilename + ") Parsed " + lineCount + " lines.");
      }
      ref4 = this.graphs;
      for (r = 0, len7 = ref4.length; r < len7; r++) {
        graph = ref4[r];
        xindices = {};
        hasData = false;
        ref5 = graph.rules.y;
        for (s = 0, len8 = ref5.length; s < len8; s++) {
          rule = ref5[s];
          for (k in rule.buckets) {
            xindices[k] = true;
            hasData = true;
          }
        }
        if (!hasData) {
          console.log("* Skipping empty graph #" + graph.index + " ('" + graph.title + "')");
          graph.empty = true;
          continue;
        }
        columns = [['x']];
        colors = {};
        ref6 = graph.rules.y;
        for (t = 0, len9 = ref6.length; t < len9; t++) {
          rule = ref6[t];
          if (this.isEmptyObject(rule.buckets)) {
            continue;
          }
          columns.push([rule.legend]);
          if (rule.color != null) {
            colors[rule.legend] = rule.color;
          }
        }
        xvalues = Object.keys(xindices).map(function(e) {
          return parseFloat(e);
        }).sort(function(a, b) {
          return a - b;
        });
        for (u = 0, len10 = xvalues.length; u < len10; u++) {
          x = xvalues[u];
          columnIndex = 0;
          columns[columnIndex].push(x);
          ref7 = graph.rules.y;
          for (w = 0, len11 = ref7.length; w < len11; w++) {
            rule = ref7[w];
            if (this.isEmptyObject(rule.buckets)) {
              continue;
            }
            columnIndex += 1;
            v = 0;
            if (rule.buckets[x] != null) {
              v = rule.buckets[x].consolidate(rule.consolidate);
            }
            columns[columnIndex].push(v);
          }
        }
        if (this.verboseEnabled) {
          console.log("(graph: " + graph.title + ") Found " + xvalues.length + " values for the X axis.");
        }
        lines = [];
        ref8 = graph.notes;
        for (z = 0, len12 = ref8.length; z < len12; z++) {
          note = ref8[z];
          lines.push({
            value: note.x,
            text: note.text
          });
        }
        graph.chart = {
          title: graph.title,
          zoom: {
            enabled: true
          },
          data: {
            x: 'x',
            columns: columns,
            colors: colors
          },
          grid: {
            x: {
              lines: lines
            }
          },
          axis: {
            x: {
              tick: {}
            }
          },
          size: graph.size
        };
        if (graph.format) {
          graph.chart.axis.x.tick.format = "function formatXAxis(v) { function DATE(s) { return d3.time.format(s)(new Date(v)); } return " + graph.format + " }";
        } else {
          graph.chart.xlabels = graph.xlabels;
          graph.chart.axis.x.tick.format = "function formatXAxis(v) { return this.xlabels[v] }";
        }
      }
      return true;
    };

    QuickGraph.prototype.generate = function() {
      var charts, graph, html, j, legends, len, ref, rule;
      charts = [];
      ref = this.graphs;
      for (j = 0, len = ref.length; j < len; j++) {
        graph = ref[j];
        if (graph.empty) {
          legends = (function() {
            var l, len1, ref1, results;
            ref1 = graph.rules.y;
            results = [];
            for (l = 0, len1 = ref1.length; l < len1; l++) {
              rule = ref1[l];
              results.push(rule.legend);
            }
            return results;
          })();
          charts.push({
            empty: true,
            title: graph.title,
            legends: legends.join(", ")
          });
        } else {
          charts.push(graph.chart);
        }
      }
      html = "<html>\n<head>\n  <link href=\"https://cdnjs.cloudflare.com/ajax/libs/c3/0.4.10/c3.min.css\" rel=\"stylesheet\" type=\"text/css\">\n  <script src=\"https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.16/d3.min.js\" charset=\"utf-8\"></script>\n  <script src=\"https://cdnjs.cloudflare.com/ajax/libs/c3/0.4.10/c3.min.js\"></script>\n</head>\n<style>\n  .title {\n    font-size: 1.4em;\n    font-style: italic;\n    margin-top: 20px;\n    margin-bottom: 5px;\n  }\n  .skipped {\n    margin: 5px;\n    font-style: italic;\n    font-size: 0.8em;\n    color: #777777;\n  }\n</style>\n<body>\n<div id='charts'></div>\n<script>\n  var charts = " + (JSON.stringify(charts)) + ";\n  var i;\n  for (i = 0; i < charts.length; i++) {\n    var chart = charts[i];\n    if(chart.empty) {\n      var d = document.createElement('div');\n      d.innerHTML = \"<div class=\\\"skipped\\\">Skipped empty graph \" + chart.title + \"; contained \" + chart.legends + \"</div>\";\n      document.getElementById(\"charts\").appendChild(d);\n    } else {\n      var titleDiv = document.createElement('div');\n      titleDiv.innerHTML = \"<div class=\\\"title\\\">\"+chart.title+\"</div>\";\n      document.getElementById(\"charts\").appendChild(titleDiv);\n\n      var d = document.createElement('div');\n      d.id = \"chart\" + i;\n      document.getElementById(\"charts\").appendChild(d);\n\n      chart.bindto = \"#\" + d.id;\n      if(chart.axis.x.tick.format) {\n        var formatXAxis = null;\n        eval(chart.axis.x.tick.format);\n        if(formatXAxis) {\n          chart.axis.x.tick.format = formatXAxis.bind(chart);\n        }\n      }\n      c3.generate(chart);\n    }\n  }\n</script>\n</body>\n</html>";
      fs.writeFileSync(this.outputFilename, html);
      return console.log("Wrote " + this.outputFilename);
    };

    return QuickGraph;

  })();

  module.exports = QuickGraph;

}).call(this);
