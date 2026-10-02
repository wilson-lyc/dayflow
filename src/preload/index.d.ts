import type { DayflowAPI } from '../shared/model'
declare global {
  interface Window {
    api: DayflowAPI
  }
}
