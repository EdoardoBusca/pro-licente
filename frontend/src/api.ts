import axios from 'axios'
import type { TrainingResult, ColumnMappingResult, PredictRequest, PredictResult } from '@/src/types'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('ev-token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('ev-token')
      localStorage.removeItem('ev-user')
      window.location.href = '/'
    }
    return Promise.reject(error)
  },
)

export const startTraining = async (
  file: File,
  target: string,
  horizon: number,
  columnMapping: object | null = null,
): Promise<{ job_id?: string; status?: string; error?: string }> => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('target', target)
  formData.append('horizon', String(horizon))
  if (columnMapping) formData.append('column_mapping', JSON.stringify(columnMapping))
  const response = await api.post<{ job_id?: string; status?: string; error?: string }>('/train', formData)
  return response.data
}

export const mapColumns = async (file: File): Promise<ColumnMappingResult> => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await api.post<ColumnMappingResult>('/map-columns', formData)
  return response.data
}

export const getAiAdvice = async (payload: object): Promise<{ advice?: string; error?: string }> => {
  const response = await api.post<{ advice?: string; error?: string }>('/ai-advice', payload)
  return response.data
}

export interface MarketSignal {
  name: string
  lag_days: number
  correlation: number
  description: string
}

export const getMarketIntelligence = async (
  payload: object,
): Promise<{ signals?: MarketSignal[]; error?: string }> => {
  const response = await api.post<{ signals?: MarketSignal[]; error?: string }>('/market-intelligence', payload)
  return response.data
}

export const getTrainingResult = async (
  jobId: string,
): Promise<{ status: string; data?: TrainingResult; error?: string }> => {
  const response = await api.get<{ status: string; data?: TrainingResult; error?: string }>(
    `/results/${jobId}`,
  )
  return response.data
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const waitForTrainingCompletion = async (
  jobId: string,
  onProgress?: (attempt: number, max: number) => void,
  pollMs = 1500,
  maxAttempts = 200,
): Promise<TrainingResult> => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    onProgress?.(attempt + 1, maxAttempts)
    const result = await getTrainingResult(jobId)
    if (result?.status === 'completed') return result.data!
    if (result?.status === 'failed') throw new Error(result.error || 'Training failed.')
    if (result?.status === 'not_found') throw new Error('Training job was not found.')
    await delay(pollMs)
  }
  throw new Error('Training timed out. Please try again.')
}

export const predictSingle = async (
  jobId: string,
  fields: PredictRequest,
): Promise<PredictResult & { debug_inputs?: Record<string, number> }> => {
  const response = await api.post<PredictResult & { debug_inputs?: Record<string, number> }>(
    `/predict/${jobId}`,
    fields,
  )
  return response.data
}

export const logout = (): void => {
  localStorage.removeItem('ev-token')
  localStorage.removeItem('ev-user')
  window.location.href = '/'
}

// Shape stored by the login modal — mirrors backend auth.py's login response.
export const getStoredUser = (): { id?: number; name: string; email: string; role: string } | null => {
  if (typeof window === 'undefined') return null
  try {
    return JSON.parse(localStorage.getItem('ev-user') || 'null')
  } catch {
    return null
  }
}
