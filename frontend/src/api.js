import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:8000' });

export const startTraining = async (file, target, horizon, columnMapping = null) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('target', target);
  formData.append('horizon', String(horizon));
  if (columnMapping) {
    formData.append('column_mapping', JSON.stringify(columnMapping));
  }
  const response = await api.post('/train', formData);
  return response.data;
};

export const mapColumns = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/map-columns', formData);
  return response.data;
};

export const getAiAdvice = async (payload) => {
  const response = await api.post('/ai-advice', payload);
  return response.data;
};

export const getTrainingResult = async (jobId) => {
  const response = await api.get(`/results/${jobId}`);
  return response.data;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitForTrainingCompletion = async (jobId, onProgress, pollMs = 1500, maxAttempts = 200) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    onProgress?.(attempt + 1, maxAttempts);
    const result = await getTrainingResult(jobId);
    if (result?.status === 'completed') return result.data;
    if (result?.status === 'failed')    throw new Error(result.error || 'Training failed.');
    if (result?.status === 'not_found') throw new Error('Training job was not found.');
    await delay(pollMs);
  }
  throw new Error('Training timed out. Please try again.');
};

export const predictSingle = async (jobId, fields) => {
  const response = await api.post(`/predict/${jobId}`, fields);
  return response.data;
};

export const simulateMarketScenario = async ({
  baseValuation, sliderValue, marketCycle, renovationPackage, forecastHorizonMonths,
}) => {
  const response = await api.post('/simulate-scenario', {
    base_valuation: Number(baseValuation),
    slider_value: Number(sliderValue),
    market_cycle: marketCycle || null,
    renovation_package: renovationPackage || 'basic',
    forecast_horizon_months: Number(forecastHorizonMonths || 12),
  });
  return response.data;
};