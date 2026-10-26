export async function loadSamplePlan({ baseUrl = '/', fetcher = fetch, addFiles, onBusy, onError }) {
  onBusy(true); onError('');
  try {
    const response = await fetcher(`${baseUrl}demo/sample-finish-plan.pdf`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Sample download failed (HTTP ${response.status}). Please try again.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('The sample PDF is unavailable. Reload the app and try again.');
    const opened = await addFiles([new File([bytes], 'sample-finish-plan.pdf', { type: 'application/pdf' })]);
    if (opened === false) throw new Error('The sample could not be opened. Sign in with editing access and try again, or check the import message.');
    return true;
  } catch (error) {
    onError(error?.name === 'TimeoutError' ? 'The sample download timed out. Please try again.' : error?.message || 'Could not load the sample plan. Please try again.');
    return false;
  } finally { onBusy(false); }
}
