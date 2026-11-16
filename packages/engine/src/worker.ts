import { serve, type WorkerScope } from './transport/worker-host.ts'

serve(self as unknown as WorkerScope)
