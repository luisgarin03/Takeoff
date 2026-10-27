import { searchSymbolRaster } from './symbolSearch.js';
self.onmessage = ({ data }) => {
  try { self.postMessage(searchSymbolRaster(data.image, data.template, data.options)); }
  catch (error) { self.postMessage({ error: error.message || 'Symbol matching failed.' }); }
};
