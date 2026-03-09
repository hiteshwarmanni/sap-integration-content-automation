const { expect } = require('chai');
const sinon = require('sinon');
const JSZip = require('jszip');
const { editZipWithJSZip } = require('../routes/transport.routes');
const { logInfo, logError, logWarn } = require('../cloud-logger');

describe('editZipWithJSZip', () => {
  let logInfoStub, logErrorStub, logWarnStub;

  beforeEach(() => {
    logInfoStub = sinon.stub(console, 'log');
    logErrorStub = sinon.stub(console, 'error');
    logWarnStub = sinon.stub(console, 'warn');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should rename .iflw file and update MANIFEST.MF, replacing all occurrences', async () => {
    // Create a mock zip file
    const zip = new JSZip();
    zip.file('sourceIflowId_test.iflw', 'iflow content with sourceIflowId');
    zip.file('MANIFEST.MF', 'Manifest-Version: 1.0\nImplementation-Title: sourceIflowId\nOther-Property: sourceIflowId');
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // Call the function
    const result = await editZipWithJSZip(zipBuffer, 'sourceIflowId', 'targetIflowId');

    // Check the result
    const resultZip = await JSZip.loadAsync(result);
    
    // Check if .iflw file is renamed
    expect(await resultZip.file('sourceIflowId_test.iflw')).to.be.null;
    expect(await resultZip.file('targetIflowId_test.iflw')).to.not.be.null;

    // Check if .iflw file content is updated
    const iflwContent = await resultZip.file('targetIflowId_test.iflw').async('string');
    expect(iflwContent).to.include('targetIflowId');
    expect(iflwContent).to.not.include('sourceIflowId');

    // Check if MANIFEST.MF is updated
    const manifestContent = await resultZip.file('MANIFEST.MF').async('string');
    expect(manifestContent).to.include('Implementation-Title: targetIflowId');
    expect(manifestContent).to.include('Other-Property: targetIflowId');
    expect(manifestContent).to.not.include('sourceIflowId');

    // Check if proper logging occurred
    expect(logInfoStub.calledWith('Zip file loaded, processing contents...')).to.be.true;
    expect(logInfoStub.calledWith('Renamed .iflw file:')).to.be.true;
    expect(logInfoStub.calledWith('Updated MANIFEST.MF file')).to.be.true;
    expect(logInfoStub.calledWith('Zip editing process completed successfully')).to.be.true;
  });

  it('should handle multiple .iflw files and replace all occurrences in MANIFEST.MF', async () => {
    // Create a mock zip file with multiple .iflw files
    const zip = new JSZip();
    zip.file('sourceIflowId_test1.iflw', 'iflow content 1 with sourceIflowId');
    zip.file('sourceIflowId_test2.iflw', 'iflow content 2 with sourceIflowId');
    zip.file('MANIFEST.MF', 'Manifest-Version: 1.0\nImplementation-Title: sourceIflowId\nOther-Property: sourceIflowId\nAnother-Property: sourceIflowId');
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // Call the function
    const result = await editZipWithJSZip(zipBuffer, 'sourceIflowId', 'targetIflowId');

    // Check the result
    const resultZip = await JSZip.loadAsync(result);
    
    // Check if both .iflw files are renamed
    expect(await resultZip.file('sourceIflowId_test1.iflw')).to.be.null;
    expect(await resultZip.file('sourceIflowId_test2.iflw')).to.be.null;
    expect(await resultZip.file('targetIflowId_test1.iflw')).to.not.be.null;
    expect(await resultZip.file('targetIflowId_test2.iflw')).to.not.be.null;

    // Check if both .iflw file contents are updated
    const iflwContent1 = await resultZip.file('targetIflowId_test1.iflw').async('string');
    const iflwContent2 = await resultZip.file('targetIflowId_test2.iflw').async('string');
    expect(iflwContent1).to.include('targetIflowId');
    expect(iflwContent2).to.include('targetIflowId');
    expect(iflwContent1).to.not.include('sourceIflowId');
    expect(iflwContent2).to.not.include('sourceIflowId');

    // Check if MANIFEST.MF is updated with all occurrences replaced
    const manifestContent = await resultZip.file('MANIFEST.MF').async('string');
    expect(manifestContent).to.include('Implementation-Title: targetIflowId');
    expect(manifestContent).to.include('Other-Property: targetIflowId');
    expect(manifestContent).to.include('Another-Property: targetIflowId');
    expect(manifestContent).to.not.include('sourceIflowId');

    // Check if proper logging occurred
    expect(logInfoStub.calledWith('Zip file loaded, processing contents...')).to.be.true;
    expect(logInfoStub.calledWith('Renamed .iflw file:')).to.be.true;
    expect(logInfoStub.calledWith('Updated MANIFEST.MF file')).to.be.true;
    expect(logInfoStub.calledWith('Zip editing process completed successfully')).to.be.true;
  });

  it('should throw an error if .iflw file is not found', async () => {
    const zip = new JSZip();
    zip.file('MANIFEST.MF', 'Manifest-Version: 1.0');
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    try {
      await editZipWithJSZip(zipBuffer, 'sourceIflowId', 'targetIflowId');
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).to.include('Failed to edit zip file: Failed to rename .iflw file');
      expect(logErrorStub.calledWith('Error in editZipWithJSZip: Failed to rename .iflw file')).to.be.true;
    }
  });

  it('should log a warning if MANIFEST.MF is not edited', async () => {
    const zip = new JSZip();
    zip.file('test.iflw', 'iflow content');
    zip.file('MANIFEST.MF', 'Manifest-Version: 1.0');
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    await editZipWithJSZip(zipBuffer, 'sourceIflowId', 'targetIflowId');

    expect(logWarnStub.calledWith('No MANIFEST.MF file found or no edits were made')).to.be.true;
  });
});
