// Generated by CoffeeScript 1.10.0
(function() {
  var Bucket, CoffeeScript, LineReader, QuickGraph, XRegExp, fs;

  fs = require('fs');

  CoffeeScript = require('coffee-script');

  XRegExp = require('xregexp');

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
        this.lines = String(buffer).split(/(?:\n|\r\n|\r)/g);
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
      this.defaultEval = this.compile("parseFloat(@V)");
      this.DEFAULT_OUTPUT_FILENAME = "quickgraph.html";
      this.outputFilename = this.DEFAULT_OUTPUT_FILENAME;
    }

    QuickGraph.prototype.syntax = function() {
      console.error("Syntax: qg [options] logfile [... logfile]\n");
      console.error("Options:");
      console.error("        -h,--help                  This help output");
      console.error("        -o,--output FILENAME       Output filename (default: " + this.DEFAULT_OUTPUT_FILENAME + ")");
      console.error("        -a,--alias ALIAS           Use named alias from your home directory's .quickgraphrc");
      console.error("        -g,--graph                 Begin a new graph. This is not necessary if you're only making one");
      console.error("        -t,--title TITLE           Sets the title of the current graph");
      console.error("        -x REGEX                   Matches a new X axis value, parsed by -e, formatted with -f or -F");
      console.error("        -y REGEX                   Matches a new Y axis value, parsed by -e, formatted with -f or -F");
      console.error("        -l,--legend LEGEND         Sets the legend for the current axis");
      console.error("        -c,--consolidate FUNC      Sets the consolidation function for the current axis (sum, count, avg, min, max, last)");
      console.error("        -e,--eval CODE             Sets the evaluator for the axis regex's output. See examples");
      console.error("        -f,--format FORMAT         Sets a C3 timeseries format for the X axis");
      console.error("        -F,--format-function CODE  Sets the code used to interpret a JS Date object for the X axis");
    };

    QuickGraph.prototype.compile = function(func) {
      return CoffeeScript.compile(func, {
        bare: true
      });
    };

    QuickGraph.prototype.stringToArgs = function(value) {
      var match, myArray, myRegexp, myString;
      myRegexp = /([^\s'"]+(['"])([^\2]*?)\2)|[^\s'"]+|(['"])([^\4]*?)\4/gi;
      myString = value;
      myArray = [];
      while (true) {
        if (match = myRegexp.exec(myString)) {
          myArray.push(match[1] || match[5] || match[0]);
        } else {
          break;
        }
      }
      return myArray;
    };

    QuickGraph.prototype.fail = function(reason) {
      this.error = reason;
      return false;
    };

    QuickGraph.prototype.newGraph = function(index) {
      return {
        title: "Graph " + index,
        rules: {
          x: [],
          y: []
        },
        charts: []
      };
    };

    QuickGraph.prototype.newRule = function(axis, index, regex) {
      return {
        legend: "" + axis + index,
        regex: regex,
        consolidate: 'sum',
        buckets: {},
        "eval": this.defaultEval
      };
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
      var alias, aliasArgs, arg, axis, consolidate, currentGraph, error, error1, evaluator, format, formatFunc, j, lastAxis, legend, len, output, regex, rule, title, xregex;
      lastAxis = 'x';
      while (arg = args.shift()) {
        switch (arg) {
          case '-h':
          case '--help':
            this.syntax();
            return false;
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
              return this.fail("-a requires an argument");
            }
            if (!this.aliases.hasOwnProperty(alias)) {
              return this.fail("Unknown alias '" + alias + "'");
            }
            aliasArgs = this.stringToArgs(this.aliases[alias]);
            for (j = 0, len = args.length; j < len; j++) {
              arg = args[j];
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
          case '-x':
          case '-y':
            axis = arg.charAt(1);
            lastAxis = axis;
            if (!(regex = args.shift())) {
              return this.fail("-x requires an argument");
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
          case '-F':
          case '--format-function':
            currentGraph = this.currentGraph();
            if (!(formatFunc = args.shift())) {
              return this.fail("-F requires an argument");
            }
            currentGraph.formatFunc = formatFunc;
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
          case '--consolidate':
            if (!(consolidate = args.shift())) {
              return this.fail("-c requires an argument");
            }
            if (!(rule = this.currentRule(lastAxis))) {
              return this.fail("-c must modify an axis created with -x or -y");
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
            this.inputFilenames.push(arg);
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
      var axis, columnIndex, columns, context, flatRules, format, formatFunc, graph, i, inputFilename, j, k, l, lastX, len, len1, len10, len2, len3, len4, len5, len6, len7, len8, len9, line, lineCount, m, matches, n, o, p, q, r, reader, ref, ref1, ref2, ref3, ref4, ref5, ref6, ref7, rule, rules, s, t, u, v, x, xindices, xvalues;
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
        ref2 = graph.rules;
        for (axis in ref2) {
          rules = ref2[axis];
          if (rules.length === 0) {
            return this.fail("Graph '" + graph.title + "' has no " + axis + " axis rules");
          }
          for (m = 0, len2 = rules.length; m < len2; m++) {
            rule = rules[m];
            rule.axis = axis;
            rule.graph = graph;
            flatRules.push(rule);
          }
        }
      }
      ref3 = this.inputFilenames;
      for (n = 0, len3 = ref3.length; n < len3; n++) {
        inputFilename = ref3[n];
        reader = new LineReader(inputFilename);
        lastX = 0;
        lineCount = 0;
        while (line = reader.nextLine()) {
          lineCount += 1;
          if ((lineCount % 100000) === 0) {
            console.log("(" + inputFilename + ") Parsed " + lineCount + " lines.");
          }
          for (o = 0, len4 = flatRules.length; o < len4; o++) {
            rule = flatRules[o];
            if (matches = XRegExp.exec(line, rule.regex)) {
              context = {
                V: matches[0],
                f: {}
              };
              for (i = p = 0, len5 = matches.length; p < len5; i = ++p) {
                v = matches[i];
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
              v = this.evalInContext(rule["eval"], context);
              if (rule.axis === 'x') {
                lastX = v;
              } else {
                this.addToBucket(rule, lastX, v);
              }
            }
          }
        }
        console.log("(" + inputFilename + ") Parsed " + lineCount + " lines.");
      }
      ref4 = this.graphs;
      for (q = 0, len6 = ref4.length; q < len6; q++) {
        graph = ref4[q];
        xindices = {};
        ref5 = graph.rules.y;
        for (r = 0, len7 = ref5.length; r < len7; r++) {
          rule = ref5[r];
          for (k in rule.buckets) {
            xindices[k] = true;
          }
        }
        columns = [['x']];
        ref6 = graph.rules.y;
        for (s = 0, len8 = ref6.length; s < len8; s++) {
          rule = ref6[s];
          if (this.isEmptyObject(rule.buckets)) {
            continue;
          }
          columns.push([rule.legend]);
        }
        xvalues = Object.keys(xindices).map(function(e) {
          return parseFloat(e);
        }).sort(function(a, b) {
          return a - b;
        });
        for (t = 0, len9 = xvalues.length; t < len9; t++) {
          x = xvalues[t];
          columnIndex = 0;
          columns[columnIndex].push(x);
          ref7 = graph.rules.y;
          for (u = 0, len10 = ref7.length; u < len10; u++) {
            rule = ref7[u];
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
        graph.chart = {
          data: {
            x: 'x',
            columns: columns
          }
        };
        format = null;
        formatFunc = false;
        if (graph.formatFunc) {
          format = "function formatXAxis(t) { return " + graph.formatFunc + " }";
          formatFunc = true;
        } else if (graph.format) {
          format = graph.format;
        }
        if (format) {
          graph.chart.formatFunc = formatFunc;
          graph.chart.axis = {
            x: {
              type: 'timeseries',
              tick: {
                format: format
              }
            }
          };
        }
      }
      return true;
    };

    QuickGraph.prototype.generate = function() {
      var charts, graph, html, j, len, ref;
      charts = [];
      ref = this.graphs;
      for (j = 0, len = ref.length; j < len; j++) {
        graph = ref[j];
        charts.push(graph.chart);
      }
      html = "<html>\n<head>\n  <link href=\"https://cdnjs.cloudflare.com/ajax/libs/c3/0.4.10/c3.min.css\" rel=\"stylesheet\" type=\"text/css\">\n  <script src=\"https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.16/d3.min.js\" charset=\"utf-8\"></script>\n  <script src=\"https://cdnjs.cloudflare.com/ajax/libs/c3/0.4.10/c3.min.js\"></script>\n</head>\n<body>\n<div id='charts'></div>\n<script>\n  var charts = " + (JSON.stringify(charts, null, 2)) + ";\n  var i;\n  for (i = 0; i < charts.length; i++) {\n    var d = document.createElement('div');\n    d.id = \"chart\" + i;\n    document.getElementById(\"charts\").appendChild(d);\n\n    var chart = charts[i];\n    chart.bindto = \"#\" + d.id;\n    if(chart.formatFunc) {\n      eval(chart.axis.x.tick.format);\n      chart.axis.x.tick.format = formatXAxis;\n    }\n    c3.generate(chart);\n  }\n</script>\n</body>\n</html>";
      fs.writeFileSync(this.outputFilename, html);
      return console.log("Wrote " + this.outputFilename);
    };

    return QuickGraph;

  })();

  module.exports = QuickGraph;

}).call(this);
