import axios from 'axios';

// This instance points to the proxy we set up in vite.config.js
const api = axios.create({
  baseURL: '/api', 
});

/**
 * Sends the CSV file and target column to the FastAPI backend
 */
export const trainModel = async (file, target, horizon) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('target', target);
  formData.append('horizon', String(horizon));

  const response = await api.post('/train', formData, {
    headers: { 
      'Content-Type': 'multipart/form-data' 
    },
  });
  
  return response.data;
};

export default api;