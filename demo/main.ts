import { createApp } from 'vue'
import { enableDemoMode } from 'tinypivot'
import App from './App.vue'
import '../src/style.css'

// Enable demo mode to unlock all Pro features for evaluation
enableDemoMode()

createApp(App).mount('#app')

