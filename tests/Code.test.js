const { isTagBoundary, hideSidebar, showSidebar } = require('/Code');

// Mock HtmlService
const mockHtmlOutput = {
  setTitle: jest.fn().mockReturnThis(),
  setWidth: jest.fn().mockReturnThis(),
  addMetaTag: jest.fn().mockReturnThis(),
  setXFrameOptionsMode: jest.fn().mockReturnThis()
};

global.HtmlService = {
  createHtmlOutputFromFile: jest.fn().mockReturnValue(mockHtmlOutput),
  XFrameOptionsMode: {
    ALLOWALL: 'ALLOWALL'
  }
};

// Mock DocumentApp global
global.DocumentApp = {
  getUi: jest.fn().mockReturnValue({
    clear: jest.fn(),
    showSidebar: jest.fn()
  })
};


describe('hideSidebar', () => {
  test('calls DocumentApp.getUi().clear()', () => {
    hideSidebar();
    
    // Check main call
    expect(global.DocumentApp.getUi).toHaveBeenCalled();
    
    // Check clear() on any returned UI object
    const ui = global.DocumentApp.getUi.mock.results[0].value;
    expect(ui.clear).toHaveBeenCalled();
  });
});

describe('showSidebar', () => {
  test('creates and shows sidebar correctly', () => {
    showSidebar();

    expect(global.HtmlService.createHtmlOutputFromFile).toHaveBeenCalledWith('Index');
    expect(mockHtmlOutput.setTitle).toHaveBeenCalledWith('Tag Manager');
    expect(mockHtmlOutput.setWidth).toHaveBeenCalledWith(360);
    expect(mockHtmlOutput.addMetaTag).toHaveBeenCalledWith('viewport', 'width=device-width, initial-scale=1');
    expect(mockHtmlOutput.setXFrameOptionsMode).toHaveBeenCalledWith(global.HtmlService.XFrameOptionsMode.ALLOWALL);

    expect(global.DocumentApp.getUi).toHaveBeenCalled();
    const ui = global.DocumentApp.getUi.mock.results[0].value;
    expect(ui.showSidebar).toHaveBeenCalledWith(mockHtmlOutput);
  });
});
