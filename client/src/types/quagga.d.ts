declare module 'quagga' {
  interface QuaggaResult {
    codeResult: {
      code: string
    }
  }

  interface QuaggaConfig {
    inputStream: {
      name: string
      type: string
      target: HTMLElement
      constraints: {
        width: number
        height: number
        facingMode: string
      }
    }
    locator: {
      patchSize: string
      halfSample: boolean
    }
    numOfWorkers: number
    decoder: {
      readers: string[]
    }
    locate: boolean
  }

  const Quagga: {
    init(config: QuaggaConfig, callback: (err: any) => void): void
    start(): void
    stop(): void
    onDetected(callback: (result: QuaggaResult) => void): void
    offDetected(): void
  }

  export default Quagga
}
