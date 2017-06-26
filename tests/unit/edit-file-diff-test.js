var expect = require('chai').expect;
var fs     = require('fs-extra');
var path   = require('path');
var MockUI = require('console-ui/mock');
var EditFileDiff = require('../../lib/edit-file-diff');
var td = require('testdouble');
var fixturify = require('fixturify');

describe('edit-file-diff', function() {
  var ui;
  var tmpdir = path.join(__dirname, '../../tmp');

  beforeEach(function() {
    ui = new MockUI();
  });

  afterEach(function() {
    fs.removeSync(tmpdir);
  });

  describe('constructor', function() {
    it('throws if constructor is called without new', function() {
      expect(function() {
        EditFileDiff();
      }).to.throw(/Please use the `new` operator/);
    });

    it('throws if no info is provided', function() {
      expect(function() {
        new EditFileDiff();
      }).to.throw('options.info not provided to EditFileDiff constructor');
    });
  });

  describe('.edit', function() {
    it('apply no-change patch', function() {
      var openEditor = td.function('open editor');

      var outputPath = tmpdir + '/empty';
      fixturify.writeSync(tmpdir, {
        empty: ''
      });

      var file = new EditFileDiff({
        info: {
          outputPath: outputPath,
          render: function() { return ''; }
        },
        ui: ui,
        openEditor: openEditor // pretend to be an text editor but make no changes
      });

      return file.edit().finally(function() {
        td.verify(openEditor(td.matchers.contains('currentDiff.diff')), { times: 1 });
      });
    });

    it('apply simple patch', function() {
      var openEditor = td.function('open editor');
      var outputPath = tmpdir + '/nonEmpty';
      fixturify.writeSync(tmpdir, {
        nonEmpty: 'first this line'
      });

      var file = new EditFileDiff({
        info: {
          outputPath: outputPath,
          render: function() { return 'then this line'; }
        },
        ui: ui,
        openEditor: openEditor // pretend to be an text editor but make no changes
      });

      return file.edit().then(function() {
        expect(fs.readFileSync(outputPath, 'UTF8')).to.eql('then this line\n');
        td.verify(openEditor(td.matchers.contains('currentDiff.diff')), { times: 1 });
      });
    });

    it('apply valid patch', function() {
      var openEditor = td.function('open editor');
      td.when(openEditor(td.matchers.contains('currentDiff.diff'))).thenReturn('++OMG');
      var outputPath = tmpdir + '/nonEmpty';
      fixturify.writeSync(tmpdir, {
        nonEmpty: 'first this line'
      });

      var file = new EditFileDiff({
        info: {
          outputPath: outputPath,
          render: function() { return 'then this line'; }
        },
        ui: ui,
        openEditor: function(filePath) {
          fs.writeFileSync(filePath, 'Index: ' + filePath + '\n'
            + '===================================================================\n'
            + '@@ -0,1 +0,1 @@\n'
            + '-first this line\n'
            + '+but now this');
          openEditor.apply(this, arguments);
        }
      });

      return file.edit().then(function() {
        expect(fs.readFileSync(outputPath, 'UTF8')).to.eql('but now this');
        td.verify(openEditor(td.matchers.contains('currentDiff.diff')), { times: 1 });
      });
    });

    it('apply invalid patch', function() {
      var openEditor = td.function('open editor');
      td.when(openEditor(td.matchers.contains('currentDiff.diff'))).thenReturn('++OMG');
      var outputPath = tmpdir + '/nonEmpty';
      fixturify.writeSync(tmpdir, {
        nonEmpty: 'first this line'
      });

      var file = new EditFileDiff({
        info: {
          outputPath: outputPath,
          render: function() { return 'then this line'; }
        },
        ui: ui,
        openEditor: function(filePath) {
          fs.writeFileSync(filePath, 'Index: ' + filePath + '\n'
            // just some other random patch, that can't possible apply cleanly
          + '===================================================================\n'
          + '--- test\theader1\n'
          + '+++ test\theader2\n'
          + '@@ -1,4 +1,5 @@\n'
          + ' line1\n'
          + ' line2\n'
          + ' line3\n'
          + '+line44\n'
          + '+line5\n'
          + '-line4\n');
          openEditor.apply(this, arguments);
        }
      });

      var didReject = false;
      return file.edit().catch(function(reason) {
        didReject = true;
        expect(fs.readFileSync(outputPath, 'UTF8', 'leaves the file as it was')).to.eql('first this line');
        expect(ui.output).to.match(/Patch was not cleanly applied. Please choose another action\./);
        expect(reason.message).to.eql('Patch was not cleanly applied.');
        expect(reason.isSilentError).to.eql(true);
      }).then(function(){
        expect(didReject).to.eql(true);
        td.verify(openEditor(td.matchers.contains('currentDiff.diff')), { times: 1 });
      });
    });
  });
});
