'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import html2canvas from 'html2canvas'
import * as domtoimage from 'dom-to-image'

interface TradingPair {
  symbol: string
  baseAsset: string
  quoteAsset: string
  price: string
}

interface TradeData {
  symbol: string
  type: 'long' | 'short'
  entryPrice: number
  leverage: number
  investment: number
  currentPrice: number
  pnl: number
  roi: number
  liquidationPrice: number
  isActive: boolean
  startTime: Date
}

interface TradeHistory {
  id: string
  symbol: string
  type: 'long' | 'short'
  entryPrice: number
  exitPrice: number
  leverage: number
  investment: number
  pnl: number
  roi: number
  startTime: Date
  endTime: Date
  duration: number // dakika cinsinden
  status: 'completed' | 'liquidated'
}

interface TradeStats {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  liquidatedTrades: number
  winRate: number
  totalPnL: number
  totalROI: number
  avgROI: number
  avgDuration: number
  bestTrade: TradeHistory | null
  worstTrade: TradeHistory | null
}

export default function TradingSimulator() {
  const [tradingPairs, setTradingPairs] = useState<TradingPair[]>([])
  const [selectedPair, setSelectedPair] = useState<string>('BTCUSDT')
  const [currentPrice, setCurrentPrice] = useState<number>(0)
  const [tradeType, setTradeType] = useState<'long' | 'short'>('long')
  const [leverage, setLeverage] = useState<number>(10)
  const [investment, setInvestment] = useState<number>(100)
  const [investmentInput, setInvestmentInput] = useState<string>('100')
  const [activeTradeData, setActiveTradeData] = useState<TradeData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPairSwitching, setIsPairSwitching] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [wsConnectionStatus, setWsConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')
  const [buttonPosition, setButtonPosition] = useState({ x: typeof window !== 'undefined' ? window.innerWidth - 120 : 300, y: typeof window !== 'undefined' ? window.innerHeight - 120 : 500 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hasMoved, setHasMoved] = useState(false)
  const [showLiquidationModal, setShowLiquidationModal] = useState(false)
  const [liquidationData, setLiquidationData] = useState<{loss: number, price: number} | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showUsernameModal, setShowUsernameModal] = useState(false)
  const [username, setUsername] = useState('')
  const [usernameInput, setUsernameInput] = useState('')
  const [tradeHistory, setTradeHistory] = useState<TradeHistory[]>([])
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [statsFilter, setStatsFilter] = useState<{
    coin: string
    type: 'all' | 'long' | 'short'
    period: 'all' | '24h' | '7d' | '30d'
  }>({ coin: 'all', type: 'all', period: 'all' })
  const [availableCoins, setAvailableCoins] = useState<string[]>([])
  const [showInvestmentWarning, setShowInvestmentWarning] = useState(false)

  // Yatırım miktarına göre maksimum kaldıraç hesaplama
  const getMaxLeverage = (investmentAmount: number): number => {
    if (investmentAmount <= 500) return 125
    if (investmentAmount <= 1000) return 100
    if (investmentAmount <= 3000) return 50
    if (investmentAmount <= 5000) return 25
    if (investmentAmount <= 10000) return 15
    if (investmentAmount <= 15000) return 10
    return 10 // fallback
  }

  // Mevcut maksimum kaldıraç
  const maxLeverage = getMaxLeverage(investment)

  // localStorage'dan aktif trade'i geri yükle
  useEffect(() => {
    try {
      const savedTrade = localStorage.getItem('activeTrade')
      if (savedTrade) {
        const tradeData = JSON.parse(savedTrade)
        // Date objesini yeniden oluştur
        tradeData.startTime = new Date(tradeData.startTime)
        // Sadece aktif trade'leri yükle
        if (tradeData.isActive) {
          setActiveTradeData(tradeData)
          setSelectedPair(tradeData.symbol)
          setLeverage(tradeData.leverage)
          setInvestment(tradeData.investment)
          setInvestmentInput(tradeData.investment.toString())
          setTradeType(tradeData.type)
          console.log('💾 Kaydedilmiş trade geri yüklendi:', tradeData)
        } else {
          localStorage.removeItem('activeTrade')
        }
      }

      // Trade geçmişini yükle
      const savedHistory = localStorage.getItem('tradeHistory')
      if (savedHistory) {
        const history = JSON.parse(savedHistory).map((trade: any) => ({
          ...trade,
          startTime: new Date(trade.startTime),
          endTime: new Date(trade.endTime)
        }))
        setTradeHistory(history)
        console.log('💾 Trade geçmişi yüklendi:', history.length, 'trade')
      }

      // Kaydedilmiş kullanıcı adını yükle
      const savedUsername = localStorage.getItem('tradeUsername')
      if (savedUsername) {
        setUsername(savedUsername)
        console.log('💾 Kullanıcı adı geri yüklendi:', savedUsername)
      }

      // Kayıtlı buton pozisyonunu yükle
      const savedPosition = localStorage.getItem('floatingButtonPosition')
      if (savedPosition) {
        const parsed = JSON.parse(savedPosition)
        setButtonPosition(parsed)
        console.log('💾 Buton pozisyonu geri yüklendi:', parsed)
      }
    } catch (error) {
      console.error('Trade/pozisyon geri yükleme hatası:', error)
      localStorage.removeItem('activeTrade')
      localStorage.removeItem('tradeHistory')
      localStorage.removeItem('floatingButtonPosition')
    }
  }, [])

  // Screenshot alma fonksiyonu - Multi-method approach
  const takeScreenshot = async () => {
    console.log('Screenshot alma başladı...')
    
    const element = document.getElementById('trading-screenshot')
    if (!element) {
      console.error('trading-screenshot elementi bulunamadı')
      alert('❌ Screenshot alanı bulunamadı!')
      return
    }

    // Loading göster
    const loadingAlert = document.createElement('div')
    loadingAlert.innerHTML = '📸 Screenshot alınıyor...'
    loadingAlert.className = 'screenshot-loading'
    loadingAlert.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.9);
      color: white;
      padding: 20px 30px;
      border-radius: 15px;
      z-index: 1000003;
      font-size: 16px;
      font-weight: bold;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    `
    document.body.appendChild(loadingAlert)

    await new Promise(resolve => setTimeout(resolve, 300))

    try {
      let dataUrl: string | null = null
      
      // Method 1: dom-to-image (LAB color için daha iyi)
      console.log('Method 1: dom-to-image deneniyor...')
      try {
        dataUrl = await (domtoimage as any).toPng(element, {
          quality: 1.0,
          bgcolor: '#1f2937',
          width: element.offsetWidth,
          height: element.offsetHeight
        })
        console.log('dom-to-image başarılı!')
      } catch (domError) {
        console.warn('dom-to-image hatası:', domError)
        
        // Method 2: html2canvas basit ayarlar
        console.log('Method 2: html2canvas basit ayarlar...')
        try {
          const canvas = await html2canvas(element, {
            logging: false,
            useCORS: false,
            allowTaint: true
          } as any)
          dataUrl = canvas.toDataURL('image/png')
          console.log('html2canvas basit ayarlar başarılı!')
        } catch (html2Error) {
          console.warn('html2canvas basit hatası:', html2Error)
          
          // Method 3: html2canvas en minimal
          console.log('Method 3: html2canvas minimal...')
          try {
            const canvas = await html2canvas(element)
            dataUrl = canvas.toDataURL('image/png')
            console.log('html2canvas minimal başarılı!')
          } catch (minimalError) {
            console.error('Tüm metodlar başarısız:', minimalError)
            throw new Error('Tüm screenshot metodları başarısız oldu')
          }
        }
      }
      
      if (dataUrl) {
        // Download
        const link = document.createElement('a')
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
        link.download = `trading-screenshot-${timestamp}.png`
        link.href = dataUrl
        
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        console.log('Screenshot başarıyla indirildi')
        
        // Başarı mesajı
        setTimeout(() => {
          alert('📸 Screenshot başarıyla indirildi!')
        }, 100)
      } else {
        throw new Error('Hiçbir metod screenshot üretemedi')
      }
      
    } catch (error) {
      console.error('Screenshot hatası detayı:', error)
      
      // Manuel screenshot rehberi - daha detaylı
      const fallbackMessage = `❌ Otomatik screenshot alınamadı.\n\n` +
        `📱 Manuel screenshot için:\n` +
        `• Bu modalı açık tutun\n` +
        `• Android: Güç + Ses Aşağı tuşları\n` +
        `• iPhone: Yan + Ana Ekran tuşları\n` +
        `• PC: Windows + Shift + S\n\n` +
        `📄 Alternatif: Sağ tık → "Sayfayı Kaydet"`
      
      alert(fallbackMessage)
    } finally {
      // Loading'i kaldır
      const loading = document.querySelector('.screenshot-loading')
      if (loading && loading.parentNode) {
        loading.parentNode.removeChild(loading)
      }
    }
  }
  useEffect(() => {
    if (showShareModal) {
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
    } else {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
    
    // Cleanup function
    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
  }, [showShareModal])
  const wsRef = useRef<WebSocket | null>(null)
  const priceUpdateRef = useRef<HTMLDivElement>(null)
  const activeTradeRef = useRef<HTMLDivElement>(null)

  // Binance'dan tüm trading çiftlerini çek
  useEffect(() => {
    const fetchTradingPairs = async () => {
      try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/24hr')
        const data = await response.json()
        const pairs = data
          .filter((item: any) => item.symbol.endsWith('USDT'))
          .map((item: any) => ({
            symbol: item.symbol,
            baseAsset: item.symbol.replace('USDT', ''),
            quoteAsset: 'USDT',
            price: parseFloat(item.lastPrice).toFixed(8)
          }))
          .sort((a: TradingPair, b: TradingPair) => a.symbol.localeCompare(b.symbol))
        
        setTradingPairs(pairs)
        if (pairs.length > 0) {
          const btcPair = pairs.find((p: TradingPair) => p.symbol === 'BTCUSDT') || pairs[0]
          setSelectedPair(btcPair.symbol)
          setCurrentPrice(parseFloat(btcPair.price))
        }
      } catch (error) {
        console.error('Trading çiftleri yüklenirken hata:', error)
      }
    }

    fetchTradingPairs()
  }, [])

  // WebSocket bağlantısı
  const connectWebSocket = (symbol: string) => {
    if (wsRef.current) {
      wsRef.current.close()
    }

    setWsConnectionStatus('connecting')

    // Kısa bir gecikme ile bağlantı kur (hızlı geçişlerde sorun çıkmasın)
    setTimeout(() => {
      try {
        // Mobil cihazları tespit et
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        
        const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`
        console.log(`WebSocket bağlantısı kuruluyor: ${symbol} (${isMobile ? 'Mobil' : 'Masaüstü'})`)
        
        wsRef.current = new WebSocket(wsUrl)

        // Bağlantı timeout'u ekle (mobilde daha uzun süre ver)
        const connectionTimeout = setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
            console.warn('WebSocket bağlantı timeout - tekrar deneniyor...')
            wsRef.current.close()
            setWsConnectionStatus('error')
            
            // 3 saniye sonra tekrar dene
            setTimeout(() => {
              connectWebSocket(symbol)
            }, 3000)
          }
        }, isMobile ? 10000 : 5000) // Mobilde 10 saniye, masaüstünde 5 saniye

        wsRef.current.onopen = () => {
          clearTimeout(connectionTimeout)
          console.log('WebSocket başarıyla bağlandı:', symbol)
          setIsPairSwitching(false)
          setWsConnectionStatus('connected')
        }

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            const newPrice = parseFloat(data.p)
            
            if (isNaN(newPrice)) {
              console.warn('Geçersiz fiyat verisi:', data.p)
              return
            }
            
            setCurrentPrice(prevPrice => {
              // Fiyat animasyonu
              if (priceUpdateRef.current) {
                const element = priceUpdateRef.current
                if (newPrice > prevPrice) {
                  element.classList.remove('price-down')
                  element.classList.add('price-up')
                } else if (newPrice < prevPrice) {
                  element.classList.remove('price-up')
                  element.classList.add('price-down')
                }
                
                setTimeout(() => {
                  element.classList.remove('price-up', 'price-down')
                }, 500)
              }
              
              return newPrice
            })
            
            // Aktif trade varsa PnL güncelle ve liquidation kontrol et
            setActiveTradeData(prevTrade => {
              if (prevTrade && prevTrade.isActive && prevTrade.symbol.toLowerCase() === symbol.toLowerCase()) {
                console.log(`PnL güncelleniyor: ${symbol} - Fiyat: ${newPrice} - Giriş: ${prevTrade.entryPrice}`)
                
                // Liquidation kontrolü
                if (checkLiquidation(newPrice, prevTrade)) {
                  console.log(`LİKİDASYON! Fiyat: ${newPrice}, Liq Fiyatı: ${prevTrade.liquidationPrice.toFixed(2)}`)
                  handleLiquidation(prevTrade, newPrice)
                  return prevTrade // Trade handleLiquidation içinde kapatılacak
                }
                
                const positionSize = (prevTrade.leverage * prevTrade.investment) / prevTrade.entryPrice
                let pnl = 0
                
                if (prevTrade.type === 'long') {
                  pnl = (newPrice - prevTrade.entryPrice) * positionSize
                } else {
                  pnl = (prevTrade.entryPrice - newPrice) * positionSize
                }
                
                const roi = (pnl / prevTrade.investment) * 100
                
                const updatedTrade = {
                  ...prevTrade,
                  currentPrice: newPrice,
                  pnl,
                  roi
                }
                
                console.log(`Yeni PnL: ${pnl.toFixed(2)} - ROI: ${roi.toFixed(2)}%`)
                
                // LocalStorage'ı da güncelle
                localStorage.setItem('activeTrade', JSON.stringify(updatedTrade))
                
                return updatedTrade
              } else if (prevTrade) {
                console.log(`PnL güncellenmediği sebep - Trade symbol: ${prevTrade.symbol}, WebSocket symbol: ${symbol}, Active: ${prevTrade.isActive}`)
              }
              return prevTrade
            })
          } catch (parseError) {
            console.error('WebSocket mesaj ayrıştırma hatası:', parseError)
          }
        }

        wsRef.current.onerror = (error) => {
          clearTimeout(connectionTimeout)
          console.error('WebSocket bağlantı hatası:', {
            symbol,
            error: error.type || 'Bilinmeyen hata',
            timestamp: new Date().toLocaleTimeString(),
            url: wsUrl,
            userAgent: navigator.userAgent.includes('Mobile') ? 'Mobil' : 'Masaüstü',
            network: navigator.onLine ? 'Çevrimiçi' : 'Çevrimdışı'
          })
          setIsPairSwitching(false)
          setWsConnectionStatus('error')
          
          // Mobilde daha sık yeniden deneme
          const retryDelay = isMobile ? 3000 : 5000
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.CLOSED) {
              console.log(`WebSocket yeniden bağlanmaya çalışılıyor... (${retryDelay/1000}s sonra)`)
              connectWebSocket(symbol)
            }
          }, retryDelay)
        }

        wsRef.current.onclose = (event) => {
          clearTimeout(connectionTimeout)
          console.log('WebSocket bağlantısı kapandı:', {
            symbol,
            code: event.code,
            reason: event.reason || 'Sebep belirtilmedi',
            wasClean: event.wasClean,
            device: isMobile ? 'Mobil' : 'Masaüstü'
          })
          setIsPairSwitching(false)
          setWsConnectionStatus('disconnected')
          
          // Beklenmeyen kapanma durumunda yeniden bağlan (kod 1006 = abnormal closure)
          if (!event.wasClean && event.code === 1006) {
            console.log('Beklenmeyen bağlantı kopması - 2 saniye sonra yeniden bağlanılıyor...')
            setTimeout(() => {
              connectWebSocket(symbol)
            }, 2000)
          }
        }
      } catch (connectionError) {
        console.error('WebSocket bağlantı kurma hatası:', {
          error: connectionError,
          symbol,
          timestamp: new Date().toLocaleTimeString()
        })
        setWsConnectionStatus('error')
        setIsPairSwitching(false)
        
        // 5 saniye sonra tekrar dene
        setTimeout(() => {
          connectWebSocket(symbol)
        }, 5000)
      }
    }, 100)
  }

  // Trading çifti değiştiğinde WebSocket'i yeniden bağla ve fiyatı güncelle
  useEffect(() => {
    if (selectedPair && tradingPairs.length > 0) {
      // Seçilen çiftin fiyatını hemen güncelle (eğer henüz güncellenmediyse)
      const selectedPairData = tradingPairs.find(pair => pair.symbol === selectedPair)
      if (selectedPairData) {
        const newPrice = parseFloat(selectedPairData.price)
        setCurrentPrice(prevPrice => {
          if (prevPrice !== newPrice) {
            console.log(`Fiyat güncellendi: ${selectedPair} - ${prevPrice} -> ${newPrice}`)
            return newPrice
          }
          return prevPrice
        })
      }
      
      // WebSocket bağlantısını kur
      connectWebSocket(selectedPair)
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [selectedPair, tradingPairs])

  // Liquidation price hesaplama
  const calculateLiquidationPrice = (entryPrice: number, leverage: number, type: 'long' | 'short') => {
    // Likidite fiyatı = Giriş fiyatı ± (Giriş fiyatı / Kaldıraç)
    // LONG pozisyonlar için: Likidite fiyatı = Giriş fiyatı - (Giriş fiyatı / Kaldıraç)
    // SHORT pozisyonlar için: Likidite fiyatı = Giriş fiyatı + (Giriş fiyatı / Kaldıraç)
    
    const priceChange = entryPrice / leverage
    
    if (type === 'long') {
      return entryPrice - priceChange
    } else {
      return entryPrice + priceChange
    }
  }

  // Liquidation kontrolü
  const checkLiquidation = (currentPrice: number, tradeData: TradeData) => {
    if (tradeData.type === 'long' && currentPrice <= tradeData.liquidationPrice) {
      return true
    } else if (tradeData.type === 'short' && currentPrice >= tradeData.liquidationPrice) {
      return true
    }
    return false
  }

  // Liquidation işlemi
  const handleLiquidation = (tradeData: TradeData, currentPrice: number) => {
    const totalLoss = -tradeData.investment // Tüm yatırım kaybedilir
    
    // Trade'i geçmişe kaydet (liquidation olarak)
    const liquidatedTrade = {
      ...tradeData,
      currentPrice,
      pnl: totalLoss,
      roi: -100
    }
    saveTradeToHistory(liquidatedTrade, 'liquidated')
    
    setLiquidationData({
      loss: totalLoss,
      price: currentPrice
    })
    
    setShowLiquidationModal(true)
    
    // Trade'i kapat
    setTimeout(() => {
      setActiveTradeData(null)
      localStorage.removeItem('activeTrade')
    }, 100)
  }

  // Trade başlat
  const startTrade = () => {
    if (currentPrice === 0) return
    
    setIsLoading(true)
    
    setTimeout(() => {
      const liquidationPrice = calculateLiquidationPrice(currentPrice, leverage, tradeType)
      
      const newTrade: TradeData = {
        symbol: selectedPair,
        type: tradeType,
        entryPrice: currentPrice,
        leverage,
        investment,
        currentPrice,
        pnl: 0,
        roi: 0,
        liquidationPrice,
        isActive: true,
        startTime: new Date()
      }
      
      console.log(`Trade başlatıldı: ${newTrade.symbol} - Tip: ${newTrade.type} - Giriş: ${newTrade.entryPrice}`)
      
      setActiveTradeData(newTrade)
      localStorage.setItem('activeTrade', JSON.stringify(newTrade))
      
      // Trade başlatıldığında doğru sembol için WebSocket bağlantısını kontrol et
      if (selectedPair !== newTrade.symbol) {
        setSelectedPair(newTrade.symbol)
      } else {
        // Aynı sembol ise WebSocket'ı yeniden bağla (trade bilgilerini alır)
        connectWebSocket(newTrade.symbol)
      }
      
      setIsLoading(false)
      
      // Mobilde aktif trade paneline otomatik scroll
      setTimeout(() => {
        if (activeTradeRef.current) {
          activeTradeRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          })
        }
      }, 100)
    }, 1000)
  }

  // Trade geçmişini kaydetme fonksiyonu
  const saveTradeToHistory = (tradeData: TradeData, status: 'completed' | 'liquidated' = 'completed') => {
    const endTime = new Date()
    const duration = Math.round((endTime.getTime() - tradeData.startTime.getTime()) / 60000) // dakika
    
    const historyEntry: TradeHistory = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol: tradeData.symbol,
      type: tradeData.type,
      entryPrice: tradeData.entryPrice,
      exitPrice: tradeData.currentPrice,
      leverage: tradeData.leverage,
      investment: tradeData.investment,
      pnl: tradeData.pnl,
      roi: tradeData.roi,
      startTime: tradeData.startTime,
      endTime,
      duration,
      status
    }
    
    setTradeHistory(prev => {
      const newHistory = [historyEntry, ...prev].slice(0, 50) // Son 50 kaydı tut
      localStorage.setItem('tradeHistory', JSON.stringify(newHistory))
      console.log('📈 Trade geçmişe kaydedildi:', historyEntry)
      return newHistory
    })
  }
  const closeTrade = () => {
    if (!activeTradeData) return
    
    setIsLoading(true)
    
    setTimeout(() => {
      // Trade'i geçmişe kaydet
      saveTradeToHistory(activeTradeData, 'completed')
      
      setActiveTradeData(null)
      localStorage.removeItem('activeTrade')
      setIsLoading(false)
      
      console.log('Trade kapatıldı ve geçmişe kaydedildi')
    }, 500)
  }

  // İstatistikleri hesaplama fonksiyonu
  const calculateStats = (): TradeStats => {
    // Filtreleme uygula
    let filteredHistory = tradeHistory
    
    if (statsFilter.coin !== 'all') {
      filteredHistory = filteredHistory.filter(trade => trade.symbol === statsFilter.coin)
    }
    
    if (statsFilter.type !== 'all') {
      filteredHistory = filteredHistory.filter(trade => trade.type === statsFilter.type)
    }
    
    if (statsFilter.period !== 'all') {
      const daysAgo = parseInt(statsFilter.period)
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysAgo)
      filteredHistory = filteredHistory.filter(trade => trade.endTime >= cutoffDate)
    }
    
    const totalTrades = filteredHistory.length
    const winningTrades = filteredHistory.filter(trade => trade.pnl > 0)
    const losingTrades = filteredHistory.filter(trade => trade.pnl <= 0)
    const liquidatedTrades = filteredHistory.filter(trade => trade.status === 'liquidated')
    
    const totalPnL = filteredHistory.reduce((sum, trade) => sum + trade.pnl, 0)
    const totalInvestment = filteredHistory.reduce((sum, trade) => sum + trade.investment, 0)
    const avgROI = totalTrades > 0 ? filteredHistory.reduce((sum, trade) => sum + trade.roi, 0) / totalTrades : 0
    const avgDuration = totalTrades > 0 ? filteredHistory.reduce((sum, trade) => sum + trade.duration, 0) / totalTrades : 0
    
    const bestTrade = filteredHistory.length > 0 ? 
      filteredHistory.reduce((best, trade) => trade.pnl > best.pnl ? trade : best) : null
    const worstTrade = filteredHistory.length > 0 ? 
      filteredHistory.reduce((worst, trade) => trade.pnl < worst.pnl ? trade : worst) : null
    
    return {
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      liquidatedTrades: liquidatedTrades.length,
      winRate: totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0,
      totalPnL,
      totalROI: totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0,
      avgROI,
      avgDuration,
      bestTrade,
      worstTrade
    }
  }

  // Mevcut coinleri güncelle
  useEffect(() => {
    const coins = Array.from(new Set(tradeHistory.map(trade => trade.symbol)))
    setAvailableCoins(coins)
  }, [tradeHistory])

  // Filtered trade history
  const filteredTradeHistory = useMemo(() => {
    let filtered = tradeHistory

    if (statsFilter.coin !== 'all') {
      filtered = filtered.filter(trade => trade.symbol === statsFilter.coin)
    }

    if (statsFilter.type !== 'all') {
      filtered = filtered.filter(trade => trade.type === statsFilter.type)
    }

    if (statsFilter.period !== 'all') {
      const now = new Date()
      const periodMs = {
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      }[statsFilter.period]
      
      if (periodMs) {
        const cutoffTime = new Date(now.getTime() - periodMs)
        filtered = filtered.filter(trade => trade.endTime >= cutoffTime)
      }
    }

    return filtered.sort((a, b) => b.endTime.getTime() - a.endTime.getTime())
  }, [tradeHistory, statsFilter])

  const currentStats = calculateStats()
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setHasMoved(false)
    setDragStart({
      x: e.clientX - buttonPosition.x,
      y: e.clientY - buttonPosition.y
    })
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setHasMoved(false)
    const touch = e.touches[0]
    setDragStart({
      x: touch.clientX - buttonPosition.x,
      y: touch.clientY - buttonPosition.y
    })
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newX = Math.max(10, Math.min(window.innerWidth - 170, e.clientX - dragStart.x))
      const newY = Math.max(10, Math.min(window.innerHeight - 70, e.clientY - dragStart.y))
      
      // Hareket mesafesini kontrol et
      const moveDistance = Math.abs(newX - buttonPosition.x) + Math.abs(newY - buttonPosition.y)
      if (moveDistance > 3) {
        setHasMoved(true)
      }
      
      setButtonPosition({ x: newX, y: newY })
    }
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (isDragging) {
      e.preventDefault()
      const touch = e.touches[0]
      const newX = Math.max(10, Math.min(window.innerWidth - 170, touch.clientX - dragStart.x))
      const newY = Math.max(10, Math.min(window.innerHeight - 70, touch.clientY - dragStart.y))
      
      // Hareket mesafesini kontrol et
      const moveDistance = Math.abs(newX - buttonPosition.x) + Math.abs(newY - buttonPosition.y)
      if (moveDistance > 3) {
        setHasMoved(true)
      }
      
      setButtonPosition({ x: newX, y: newY })
    }
  }

  const handleDragEnd = () => {
    if (isDragging) {
      setIsDragging(false)
      // Pozisyonu localStorage'a kaydet
      localStorage.setItem('floatingButtonPosition', JSON.stringify(buttonPosition))
      
      // Kısa süre sonra hasMoved'i sıfırla
      setTimeout(() => setHasMoved(false), 100)
    }
  }

  // Aktif trade varsa onun sembolüne WebSocket bağla
  useEffect(() => {
    if (activeTradeData?.isActive && activeTradeData.symbol !== selectedPair) {
      setSelectedPair(activeTradeData.symbol)
    }
    // Eğer activeTradeData null olduşsa (trade kapatıldıysa), localStorage'u tekrar kontrol etme
    if (!activeTradeData) {
      const savedTrade = localStorage.getItem('activeTrade')
      if (savedTrade) {
        // Eğer hala localStorage'da veri varsa ama activeTradeData null ise, 
        // bu bir tutarsızlıktır, localStorage'u temizle
        localStorage.removeItem('activeTrade')
        console.log('Tutarsız localStorage verisi temizlendi')
      }
    }
  }, [activeTradeData, selectedPair])

  // Global drag event listeners
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        e.preventDefault()
        e.stopPropagation()
        handleMouseMove(e)
      }
    }
    
    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (isDragging) {
        e.preventDefault()
        e.stopPropagation()
        handleTouchMove(e)
      }
    }
    
    const handleGlobalMouseUp = () => handleDragEnd()
    const handleGlobalTouchEnd = () => handleDragEnd()

    if (isDragging) {
      // Sayfanın scroll olmasını engelle
      document.body.style.overflow = 'hidden'
      document.body.style.touchAction = 'none'
      
      document.addEventListener('mousemove', handleGlobalMouseMove, { passive: false })
      document.addEventListener('mouseup', handleGlobalMouseUp)
      document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false })
      document.addEventListener('touchend', handleGlobalTouchEnd)
    }

    return () => {
      // Scroll'u tekrar aktif et
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
      
      document.removeEventListener('mousemove', handleGlobalMouseMove)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
      document.removeEventListener('touchmove', handleGlobalTouchMove)
      document.removeEventListener('touchend', handleGlobalTouchEnd)
    }
  }, [isDragging, dragStart, buttonPosition])
  // Filtrelenmiş trading çiftleri
  const filteredPairs = tradingPairs.filter(pair => 
    pair.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pair.baseAsset.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Fiyat formatla
  const formatPrice = (price: number) => {
    if (price >= 1) {
      return price.toLocaleString('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8
      })
    }
    return price.toFixed(8)
  }

  // PnL formatla
  const formatPnL = (pnl: number) => {
    const sign = pnl >= 0 ? '+' : ''
    return `${sign}$${pnl.toFixed(2)}`
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white relative overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-purple-600/20 rounded-full filter blur-xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-96 h-96 bg-blue-600/20 rounded-full filter blur-xl animate-pulse delay-1000"></div>
          <div className="absolute bottom-20 left-1/2 w-80 h-80 bg-pink-600/20 rounded-full filter blur-xl animate-pulse delay-2000"></div>
        </div>
        {/* Ana Container */}
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-7xl relative z-10">

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            {/* Sol Panel - Trading Setup */}
            <div className="lg:col-span-1 order-1">
              <div className="bg-gradient-to-br from-gray-800/60 via-gray-800/40 to-gray-900/60 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 border border-gray-700/30 shadow-2xl hover:shadow-purple-500/10 transition-all duration-500 transform hover:scale-[1.02]">
                
                {/* Coin Seçimi */}
                <div className="mb-6 sm:mb-8">
                  <div className="flex items-center mb-3 sm:mb-4">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center mr-2 sm:mr-3">
                      <span className="text-white text-xs sm:text-sm">💰</span>
                    </div>
                    <label className="text-base sm:text-lg font-semibold text-gray-200">
                      Kripto Para Seçimi
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Coin ara... (örn: BTC, ETH)"
                      value={searchTerm}
                      onChange={(e) => {
                        const term = e.target.value
                        setSearchTerm(term)
                        
                        // Eğer arama sonucu tek coin varsa otomatik seç
                        if (term.length > 0) {
                          const filtered = tradingPairs.filter(pair => 
                            pair.symbol.toLowerCase().includes(term.toLowerCase()) ||
                            pair.baseAsset.toLowerCase().includes(term.toLowerCase())
                          )
                          
                          if (filtered.length === 1 && filtered[0].symbol !== selectedPair) {
                            const selectedCoin = filtered[0]
                            setSelectedPair(selectedCoin.symbol)
                            setCurrentPrice(parseFloat(selectedCoin.price))
                            console.log(`Otomatik seçim: ${selectedCoin.symbol} - Fiyat: ${selectedCoin.price}`)
                          }
                        }
                      }}
                      onKeyPress={(e) => {
                        // Enter tuşuna basıldığında ilk sonucu seç
                        if (e.key === 'Enter' && filteredPairs.length > 0) {
                          const selectedCoin = filteredPairs[0]
                          setSelectedPair(selectedCoin.symbol)
                          setCurrentPrice(parseFloat(selectedCoin.price))
                          setSearchTerm('')
                          console.log(`Enter ile seçim: ${selectedCoin.symbol} - Fiyat: ${selectedCoin.price}`)
                        }
                      }}
                      className="w-full px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-gray-700/60 to-gray-800/60 border border-gray-600/50 rounded-xl sm:rounded-2xl text-white placeholder-gray-400 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/20 transition-all duration-300 backdrop-blur-sm shadow-lg hover:shadow-purple-500/10 text-sm sm:text-base"
                    />
                    {/* Arama sonuçları göstergesi */}
                    {searchTerm && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs sm:text-sm text-gray-400">
                        {filteredPairs.length} sonuç
                      </div>
                    )}
                  </div>
                  
                  <select
                    value={selectedPair}
                    onChange={(e) => {
                      const newSymbol = e.target.value
                      setIsPairSwitching(true)
                      setSelectedPair(newSymbol)
                      
                      // Seçilen coinin fiyatını hemen güncelle
                      const selectedCoin = tradingPairs.find(pair => pair.symbol === newSymbol)
                      if (selectedCoin) {
                        setCurrentPrice(parseFloat(selectedCoin.price))
                        console.log(`Dropdown'dan seçildi: ${newSymbol} - Fiyat: ${selectedCoin.price}`)
                      }
                      
                      // Arama kutusunu temizle
                      setSearchTerm('')
                      
                      setTimeout(() => setIsPairSwitching(false), 1000)
                    }}
                    disabled={activeTradeData?.isActive}
                    className="w-full mt-3 sm:mt-4 px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-gray-700/60 to-gray-800/60 border border-gray-600/50 rounded-xl sm:rounded-2xl text-white focus:border-purple-500 focus:ring-4 focus:ring-purple-500/20 transition-all duration-300 disabled:opacity-50 backdrop-blur-sm shadow-lg hover:shadow-purple-500/10 text-sm sm:text-base"
                  >
                    {filteredPairs.length === 0 ? (
                      <option value="">Arama sonuçu bulunamadı...</option>
                    ) : (
                      filteredPairs.map((pair) => (
                        <option key={pair.symbol} value={pair.symbol}>
                          {pair.baseAsset}/USDT - ${formatPrice(parseFloat(pair.price))}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Pozisyon Tipi */}
                <div className="mb-6 sm:mb-8">
                  <div className="flex items-center mb-3 sm:mb-4">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gradient-to-r from-green-400 to-blue-500 rounded-lg flex items-center justify-center mr-2 sm:mr-3">
                      <span className="text-white text-xs sm:text-sm">📈</span>
                    </div>
                    <label className="text-base sm:text-lg font-semibold text-gray-200">
                      Pozisyon Yönü
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <button
                      onClick={() => setTradeType('long')}
                      disabled={activeTradeData?.isActive}
                      className={`px-3 sm:px-4 py-3 sm:py-4 rounded-xl font-bold transition-all duration-300 disabled:opacity-50 transform hover:scale-105 shadow-lg touch-manipulation ${
                        tradeType === 'long'
                          ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-green-500/50 ring-4 ring-green-400/30'
                          : 'bg-gradient-to-r from-gray-700/60 to-gray-800/60 text-gray-300 hover:from-green-500/20 hover:to-emerald-600/20 hover:text-white border border-gray-600/50'
                      }`}
                    >
                      <div className="text-lg sm:text-xl mb-1">📈</div>
                      <div className="text-sm sm:text-base font-bold">LONG</div>
                      <div className="text-xs opacity-80">Alış</div>
                    </button>
                    <button
                      onClick={() => setTradeType('short')}
                      disabled={activeTradeData?.isActive}
                      className={`px-3 sm:px-4 py-3 sm:py-4 rounded-xl font-bold transition-all duration-300 disabled:opacity-50 transform hover:scale-105 shadow-lg touch-manipulation ${
                        tradeType === 'short'
                          ? 'bg-gradient-to-r from-red-500 to-pink-600 text-white shadow-red-500/50 ring-4 ring-red-400/30'
                          : 'bg-gradient-to-r from-gray-700/60 to-gray-800/60 text-gray-300 hover:from-red-500/20 hover:to-pink-600/20 hover:text-white border border-gray-600/50'
                      }`}
                    >
                      <div className="text-lg sm:text-xl mb-1">📉</div>
                      <div className="text-sm sm:text-base font-bold">SHORT</div>
                      <div className="text-xs opacity-80">Satış</div>
                    </button>
                  </div>
                </div>

                {/* Kaldıraç */}
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-6 h-6 bg-gradient-to-r from-yellow-400 to-red-500 rounded-lg flex items-center justify-center mr-3">
                        <span className="text-white text-sm">⚡</span>
                      </div>
                      <label className="text-lg font-semibold text-gray-200">
                        Kaldıraç Oranı
                      </label>
                    </div>
                    <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-black px-4 py-2 rounded-xl font-bold text-lg shadow-lg">
                      {leverage}x
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type="range"
                      min="1"
                      max={maxLeverage}
                      value={Math.min(leverage, maxLeverage)}
                      onChange={(e) => setLeverage(Number(e.target.value))}
                      disabled={activeTradeData?.isActive}
                      className="w-full h-4 bg-gradient-to-r from-gray-700 to-gray-800 rounded-full appearance-none cursor-pointer slider-modern disabled:opacity-50"
                    />
                    <div className="grid grid-cols-9 gap-1 mt-4">
                      {[1, 5, 10, 20, 30, 50, 75, 100, 125].filter(leverageValue => leverageValue <= maxLeverage).map((leverageValue) => (
                        <button
                          key={leverageValue}
                          onClick={() => setLeverage(leverageValue)}
                          disabled={activeTradeData?.isActive}
                          className={`px-2 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all duration-300 disabled:opacity-50 transform hover:scale-105 touch-manipulation ${
                            leverage === leverageValue
                              ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-black shadow-lg shadow-yellow-500/50'
                              : 'bg-gradient-to-r from-gray-700/60 to-gray-800/60 text-gray-300 hover:from-yellow-500/20 hover:to-orange-500/20 border border-gray-600/50'
                          }`}
                        >
                          {leverageValue}x
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 text-center text-sm text-gray-400">
                    Yüksek kaldıraç = Yüksek risk & Yüksek kar potansiyeli
                    <br />
                    <span className="text-yellow-400 font-medium">
                      Mevcut limit: ${investment.toLocaleString('tr-TR')} için maksimum {maxLeverage}x
                    </span>
                  </div>
                </div>

                {/* Yatırım Miktarı */}
                <div className="mb-8">
                  <div className="flex items-center mb-4">
                    <div className="w-6 h-6 bg-gradient-to-r from-green-400 to-emerald-500 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-white text-sm">💵</span>
                    </div>
                    <label className="text-lg font-semibold text-gray-200">
                      Yatırım Miktarı (USDT)
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={investmentInput}
                      onChange={(e) => {
                        const inputValue = e.target.value
                        setInvestmentInput(inputValue)
                        
                        // If input is empty, keep it empty but set investment to 0
                        if (inputValue === '' || inputValue === '0') {
                          setInvestment(0)
                          setShowInvestmentWarning(false)
                          return
                        }
                        
                        const numValue = Number(inputValue)
                        if (!isNaN(numValue) && numValue <= 15000) {
                          setInvestment(numValue)
                          setShowInvestmentWarning(false)
                          
                          // Kaldıraç sınırını kontrol et ve gerekirse ayarla
                          const newMaxLeverage = getMaxLeverage(numValue)
                          if (leverage > newMaxLeverage) {
                            setLeverage(newMaxLeverage)
                          }
                        } else if (numValue > 15000) {
                          // Show warning for 3 seconds
                          setShowInvestmentWarning(true)
                          setTimeout(() => setShowInvestmentWarning(false), 3000)
                        }
                      }}
                      onBlur={() => {
                        // When user leaves the input, if it's empty or 0, set to minimum 1
                        if (investmentInput === '' || investmentInput === '0') {
                          setInvestmentInput('1')
                          setInvestment(1)
                        }
                      }}
                      disabled={activeTradeData?.isActive}
                      min="1"
                      max="15000"
                      placeholder="Yatırım miktarını girin..."
                      className="w-full px-6 py-4 bg-gradient-to-r from-gray-700/60 to-gray-800/60 border border-gray-600/50 rounded-2xl text-white text-xl font-bold focus:border-green-500 focus:ring-4 focus:ring-green-500/20 transition-all duration-300 disabled:opacity-50 backdrop-blur-sm shadow-lg"
                    />
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 font-bold">
                      USDT
                    </div>
                  </div>
                  
                  {/* Investment Warning */}
                  {showInvestmentWarning && (
                    <div className="mt-3 p-3 bg-red-900/30 border border-red-500/50 rounded-xl flex items-center space-x-2 animate-pulse">
                      <span className="text-red-400 text-lg">⚠️</span>
                      <span className="text-red-300 text-sm font-medium">
                        Maksimum yatırım miktarı $15,000'dır. Daha fazla yatıramazsınız!
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-3 mt-4">
                    {[50, 100, 500, 1000, 5000, 10000, 15000].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => {
                          setInvestment(amount)
                          setInvestmentInput(amount.toString())
                          
                          // Kaldıraç sınırını kontrol et ve gerekirse ayarla
                          const newMaxLeverage = getMaxLeverage(amount)
                          if (leverage > newMaxLeverage) {
                            setLeverage(newMaxLeverage)
                          }
                        }}
                        disabled={activeTradeData?.isActive}
                        className={`px-4 py-3 rounded-xl font-bold transition-all duration-300 disabled:opacity-50 transform hover:scale-105 text-sm ${
                          investment === amount 
                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/50'
                            : 'bg-gradient-to-r from-gray-700/60 to-gray-800/60 text-gray-300 hover:from-green-500/20 hover:to-emerald-600/20 border border-gray-600/50'
                        }`}
                      >
                        ${amount >= 1000 ? `${amount/1000}k` : amount}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Trade Butonu */}
                <div className="pt-4 sm:pt-6">
                  {!activeTradeData?.isActive ? (
                    <button
                      onClick={startTrade}
                      disabled={isLoading || currentPrice === 0}
                      className="w-full bg-gradient-to-r from-purple-600 via-pink-600 to-purple-700 hover:from-purple-700 hover:via-pink-700 hover:to-purple-800 text-white font-bold py-5 sm:py-6 px-6 sm:px-8 rounded-xl sm:rounded-2xl transition-all duration-300 disabled:opacity-50 shadow-2xl shadow-purple-500/50 transform hover:scale-105 glow-animation text-lg sm:text-xl touch-manipulation"
                    >
                      {isLoading ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-b-3 border-white mr-2 sm:mr-3"></div>
                          <span className="text-base sm:text-lg">Başlatılıyor...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          <span className="text-xl sm:text-2xl mr-2 sm:mr-3">🚀</span>
                          <span>TRADE BAŞLAT</span>
                        </div>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={closeTrade}
                      disabled={isLoading}
                      className="w-full bg-gradient-to-r from-red-600 via-pink-600 to-red-700 hover:from-red-700 hover:via-pink-700 hover:to-red-800 text-white font-bold py-5 sm:py-6 px-6 sm:px-8 rounded-xl sm:rounded-2xl transition-all duration-300 disabled:opacity-50 shadow-2xl shadow-red-500/50 transform hover:scale-105 text-lg sm:text-xl touch-manipulation"
                    >
                      {isLoading ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-b-3 border-white mr-2 sm:mr-3"></div>
                          <span className="text-base sm:text-lg">Kapatılıyor...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          <span className="text-xl sm:text-2xl mr-2 sm:mr-3">🔴</span>
                          <span>TRADE KAPAT</span>
                        </div>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Orta Panel - Fiyat Bilgisi */}
            <div className="lg:col-span-1 order-2 lg:order-2">
              <div className="bg-gradient-to-br from-gray-800/60 via-gray-800/40 to-gray-900/60 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-700/30 shadow-2xl mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 flex items-center">
                  <span className="text-lg sm:text-xl mr-2">📊</span> Anlık Fiyat
                </h2>
                
                <div className="text-center">
                  <div className="text-base sm:text-lg text-gray-400 mb-2">
                    {selectedPair.replace('USDT', '/USDT')}
                  </div>
                  <div 
                    ref={priceUpdateRef}
                    className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4 price-display"
                  >
                    {isPairSwitching ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-500 mr-2"></div>
                        <span className="text-base sm:text-lg">Yükleniyor...</span>
                      </div>
                    ) : (
                      `$${formatPrice(currentPrice)}`
                    )}
                  </div>
                  <div className="flex items-center justify-center">
                    <div className={`animate-pulse flex space-x-1 ${
                      wsConnectionStatus === 'connected' ? '' : 'opacity-50'
                    }`}>
                      <div className={`rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 ${
                        wsConnectionStatus === 'connected' ? 'bg-green-400' :
                        wsConnectionStatus === 'connecting' ? 'bg-yellow-400' :
                        wsConnectionStatus === 'error' ? 'bg-red-400' : 'bg-gray-400'
                      }`}></div>
                      <div className={`rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 ${
                        wsConnectionStatus === 'connected' ? 'bg-green-400' :
                        wsConnectionStatus === 'connecting' ? 'bg-yellow-400' :
                        wsConnectionStatus === 'error' ? 'bg-red-400' : 'bg-gray-400'
                      }`}></div>
                      <div className={`rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 ${
                        wsConnectionStatus === 'connected' ? 'bg-green-400' :
                        wsConnectionStatus === 'connecting' ? 'bg-yellow-400' :
                        wsConnectionStatus === 'error' ? 'bg-red-400' : 'bg-gray-400'
                      }`}></div>
                    </div>
                    <span className={`ml-2 sm:ml-3 text-xs sm:text-sm ${
                      wsConnectionStatus === 'connected' ? 'text-green-300' :
                      wsConnectionStatus === 'connecting' ? 'text-yellow-300' :
                      wsConnectionStatus === 'error' ? 'text-red-300' : 'text-gray-400'
                    }`}>
                      {wsConnectionStatus === 'connected' ? '📡 Canlı Veri' :
                       wsConnectionStatus === 'connecting' ? '🔄 Bağlanıyor...' :
                       wsConnectionStatus === 'error' ? '⚠️ Bağlantı Hatası' : '📴 Bağlantısız'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hesaplama Detayları */}
              {currentPrice > 0 && (
                <div className="bg-gradient-to-br from-gray-800/60 via-gray-800/40 to-gray-900/60 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-700/30 shadow-2xl">
                  <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">
                    <span className="mr-2">🧮</span>Hesaplama Detayları
                  </h3>
                  <div className="space-y-2 sm:space-y-3">
                    <div className="flex justify-between items-center text-sm sm:text-base">
                      <span className="text-gray-400">Pozisyon Boyutu:</span>
                      <span className="font-mono text-xs sm:text-sm">
                        {((leverage * investment) / currentPrice).toFixed(6)} {selectedPair.replace('USDT', '')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm sm:text-base">
                      <span className="text-gray-400">Toplam Değer:</span>
                      <span className="font-mono text-xs sm:text-sm">
                        ${(leverage * investment).toLocaleString('tr-TR')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm sm:text-base">
                      <span className="text-gray-400">Giriş Fiyatı:</span>
                      <span className="font-mono text-xs sm:text-sm">
                        ${formatPrice(currentPrice)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sağ Panel - Aktif Trade */}
            <div className="lg:col-span-1 order-3" ref={activeTradeRef}>
              {activeTradeData?.isActive ? (
                <div className="bg-gradient-to-br from-gray-800/60 via-gray-800/40 to-gray-900/60 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-700/30 shadow-2xl">
                  <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 flex items-center">
                    <span className="text-lg sm:text-xl mr-2">🔥</span> Aktif Trade
                  </h2>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-xl">
                      <span className="text-gray-300">Coin:</span>
                      <span className="font-bold text-lg">
                        {activeTradeData.symbol.replace('USDT', '/USDT')}
                      </span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-xl">
                      <span className="text-gray-300">Pozisyon:</span>
                      <span className={`font-bold px-3 py-1 rounded-full ${
                        activeTradeData.type === 'long' 
                          ? 'bg-green-600/20 text-green-400' 
                          : 'bg-red-600/20 text-red-400'
                      }`}>
                        {activeTradeData.type === 'long' ? '📈 LONG' : '📉 SHORT'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-xl">
                      <span className="text-gray-300">Giriş Fiyatı:</span>
                      <span className="font-mono">
                        ${formatPrice(activeTradeData.entryPrice)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-xl">
                      <span className="text-gray-300">Güncel Fiyat:</span>
                      <span className="font-mono">
                        ${formatPrice(activeTradeData.currentPrice)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-xl">
                      <span className="text-gray-300">Kaldıraç:</span>
                      <span className="font-bold">{activeTradeData.leverage}x</span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-xl">
                      <span className="text-gray-300">Yatırım:</span>
                      <span className="font-mono">${activeTradeData.investment}</span>
                    </div>

                    <div className={`flex justify-between items-center p-3 rounded-xl border-2 ${
                      activeTradeData.type === 'long' 
                        ? (activeTradeData.currentPrice <= activeTradeData.liquidationPrice ? 'bg-red-900/50 border-red-500' : 'bg-orange-900/30 border-orange-500/50')
                        : (activeTradeData.currentPrice >= activeTradeData.liquidationPrice ? 'bg-red-900/50 border-red-500' : 'bg-orange-900/30 border-orange-500/50')
                    }`}>
                      <span className="text-gray-300">Liquidation Fiyatı:</span>
                      <span className={`font-mono font-bold ${
                        (activeTradeData.type === 'long' && activeTradeData.currentPrice <= activeTradeData.liquidationPrice) ||
                        (activeTradeData.type === 'short' && activeTradeData.currentPrice >= activeTradeData.liquidationPrice)
                          ? 'text-red-400' : 'text-orange-400'
                      }`}>
                        ${formatPrice(activeTradeData.liquidationPrice)}
                      </span>
                    </div>

                    {/* PnL Gösterimi */}
                    <div className={`p-4 rounded-xl border-2 ${
                      activeTradeData.pnl >= 0 
                        ? 'bg-green-900/30 border-green-500/50' 
                        : 'bg-red-900/30 border-red-500/50'
                    }`}>
                      <div className="text-center">
                        <div className="text-sm text-gray-300 mb-2">💰 Kazanç/Kayıp</div>
                        <div className={`text-3xl font-bold mb-2 ${
                          activeTradeData.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {formatPnL(activeTradeData.pnl)}
                        </div>
                        <div className={`text-lg ${
                          activeTradeData.roi >= 0 ? 'text-green-300' : 'text-red-300'
                        }`}>
                          {activeTradeData.roi >= 0 ? '+' : ''}{activeTradeData.roi.toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 p-4 bg-blue-900/30 rounded-xl border border-blue-500/30">
                      <div className="flex items-center justify-center">
                        <div className="animate-pulse flex space-x-1">
                          <div className="rounded-full bg-blue-400 h-2 w-2"></div>
                          <div className="rounded-full bg-blue-400 h-2 w-2"></div>
                          <div className="rounded-full bg-blue-400 h-2 w-2"></div>
                        </div>
                        <span className="ml-3 text-sm text-blue-300">
                          📊 Gerçek zamanlı güncelleniyor...
                        </span>
                      </div>
                    </div>

                    {/* Paylaşım Butonu */}
                    <div className="mt-6">
                      <button
                        onClick={() => {
                          // Önce kullanıcı adı modalını aç
                          setUsernameInput(username) // Mevcut username'i input'a yükle
                          setShowUsernameModal(true)
                        }}
                        className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 hover:from-blue-700 hover:via-purple-700 hover:to-blue-800 text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 shadow-xl shadow-blue-500/30 transform hover:scale-105 flex items-center justify-center space-x-3 text-lg"
                      >
                        <span className="text-xl">📸</span>
                        <span>PAYLAŞ</span>
                        <span className="text-sm opacity-80">(Screenshot)</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-6 border border-gray-700/50 shadow-2xl">
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">💰</div>
                    <h3 className="text-xl font-semibold mb-2">Trade Bekleniyor</h3>
                    <p className="text-gray-400 mb-6">
                      Ayarlarınızı yapın ve &quot;Trade Başlat&quot; butonuna tıklayın
                    </p>
                    
                    {/* Demo Paylaşım Butonu */}
                    <button
                      onClick={async () => {
                        console.log('Demo paylaş butonuna tıklandı')
                        
                        try {
                          // Demo paylaşım metni (username dahil)
                          const usernameText = username ? `@${username} - ` : ''
                          const demoShareText = `🔥 ${usernameText}İndicSigs ile hazırım!\n` +
                            `📊 ${selectedPair} için ${tradeType.toUpperCase()} pozisyonu ${leverage}x kaldıraçla açmaya hazırım\n` +
                            `💰 Yatırım miktarı: $${investment.toLocaleString('tr-TR')}\n` +
                            `🎯 Hedef fiyat: $${formatPrice(currentPrice)}\n\n` +
                            `#İndicSigs #KaldıraçlıSinyalTesti #Crypto #${selectedPair} #${tradeType.toUpperCase()}`;
                          
                          console.log('Demo paylaşım metni hazırlandı:', demoShareText)
                          
                          // Web Share API kontrolü
                          if (navigator.share && typeof navigator.share === 'function') {
                            console.log('Web Share API mevcut, deneniyor...')
                            try {
                              await navigator.share({
                                title: 'Trading Hazırlığım',
                                text: demoShareText
                              })
                              console.log('Web Share API başarılı')
                              return
                            } catch (shareError) {
                              console.warn('Web Share API hatası:', shareError)
                            }
                          }
                          
                          // Clipboard fallback
                          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                            try {
                              await navigator.clipboard.writeText(demoShareText)
                              console.log('Clipboard API başarılı')
                              alert('📋 Hazırlık paylaşımı kopyalandı! Sosyal medyada paylaşabilirsiniz.')
                              return
                            } catch (clipboardError) {
                              console.warn('Clipboard API hatası:', clipboardError)
                            }
                          }
                          
                          // TextArea fallback
                          const textArea = document.createElement('textarea')
                          textArea.value = demoShareText
                          textArea.style.position = 'fixed'
                          textArea.style.opacity = '0'
                          textArea.style.left = '-9999px'
                          document.body.appendChild(textArea)
                          textArea.select()
                          
                          try {
                            const successful = document.execCommand('copy')
                            if (successful) {
                              alert('📋 Hazırlık paylaşımı kopyalandı!')
                            } else {
                              alert(`📝 Manuel kopyalama:\n\n${demoShareText}`)
                            }
                          } catch (error) {
                            alert(`📝 Manuel kopyalama:\n\n${demoShareText}`)
                          } finally {
                            document.body.removeChild(textArea)
                          }
                          
                        } catch (error) {
                          console.error('Demo paylaşım hatası:', error)
                          alert('❌ Paylaşım sırasında hata oluştu.')
                        }
                      }}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg transform hover:scale-105 flex items-center space-x-2 mx-auto"
                    >
                      <span>🚀</span>
                      <span>Hazırlığımı Paylaş</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Alt Bilgi */}
          <div className="mt-12 text-center">
            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4 max-w-2xl mx-auto">
              <p className="text-yellow-300 text-sm">
                ⚠️ İndicSigs sinyallerinin performansını risksiz şekilde test edebileceğiniz bir simülasyon aracıdır. Gerçek yatırım içermez.
              </p>
            </div>
            
            {/* İstatistikler Butonu */}
            {tradeHistory.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={() => setShowStatsModal(true)}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg transform hover:scale-105 flex items-center mx-auto space-x-2"
                >
                  <span className="text-xl">📊</span>
                  <span>Trade İstatistikleri ({tradeHistory.length})</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Floating Trade Kapat Button - Sadece aktif trade varsa görünür */}
        {activeTradeData?.isActive && (
          <div 
            className="fixed z-50 lg:hidden"
            style={{
              left: `${buttonPosition.x}px`,
              top: `${buttonPosition.y}px`,
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
          >
            <button
              onClick={(e) => {
                // Sadece hareket etmediyse close işlemini yap
                if (!hasMoved && !isDragging) {
                  closeTrade()
                }
              }}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              disabled={isLoading}
              className={`bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-5 rounded-full shadow-2xl shadow-red-500/50 transition-all duration-300 disabled:opacity-50 touch-manipulation flex items-center space-x-2 select-none ${
                isDragging ? 'scale-110 cursor-grabbing' : 'transform hover:scale-105 cursor-grab'
              }`}
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <span className="text-lg">❌</span>
                  <span className="text-xs font-bold whitespace-nowrap">POZISYONU KAPAT</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Kullanıcı Adı Modal */}
        {showUsernameModal && (
          <>
            {/* Overlay */}
            <div 
              className="fixed inset-0 bg-black/80 z-[999998]" 
              onClick={() => setShowUsernameModal(false)}
              style={{ zIndex: 999998 }}
            ></div>
            
            {/* Modal Content */}
            <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 999999 }}>
              <div className="bg-gradient-to-br from-gray-900 via-slate-900 to-black backdrop-blur-xl rounded-2xl sm:rounded-3xl border-2 border-gray-600/50 shadow-2xl w-full max-w-md mx-2 sm:mx-0 relative" style={{ zIndex: 1000000 }}>
                
                {/* Kapat Butonu */}
                <button
                  onClick={() => setShowUsernameModal(false)}
                  className="absolute top-2 sm:top-4 right-2 sm:right-4 w-8 h-8 sm:w-10 sm:h-10 bg-gray-700/80 hover:bg-gray-600 rounded-full flex items-center justify-center text-white transition-all duration-300 text-sm sm:text-base z-10"
                >
                  ✕
                </button>

                <div className="p-6 sm:p-8">
                  {/* Header */}
                  <div className="text-center mb-6">
                    <div className="text-4xl mb-3">👤</div>
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                      Kullanıcı Adınız
                    </h2>
                    <p className="text-gray-400 text-sm">
                      Paylaşımda görünecek kullanıcı adınızı girin
                    </p>
                  </div>

                  {/* Username Input */}
                  <div className="mb-6">
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value.slice(0, 20))} // Max 20 karakter
                      placeholder="Örn: CryptoTrader123"
                      className="w-full px-4 py-3 bg-gray-800/60 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/20 transition-all duration-300 text-center text-lg font-medium"
                      maxLength={20}
                      autoFocus
                    />
                    <div className="text-right text-xs text-gray-500 mt-1">
                      {usernameInput.length}/20 karakter
                    </div>
                  </div>

                  {/* Info */}
                  <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-4 mb-6">
                    <div className="flex items-start space-x-3">
                      <span className="text-blue-400 text-lg flex-shrink-0">ℹ️</span>
                      <div className="text-sm text-blue-200">
                        <p className="font-medium mb-1">Kullanıcı adınız:</p>
                        <ul className="text-xs space-y-1 text-blue-300">
                          <li>• Screenshot'ta görünecek</li>
                          <li>• Sosyal medya paylaşımlarında yer alacak</li>
                          <li>• Maksimum 20 karakter</li>
                          <li>• Bir kez kaydedilir, sonra hatırlanır</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setShowUsernameModal(false)}
                      className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center space-x-2"
                    >
                      <span>✕</span>
                      <span>Vazgeç</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        const finalUsername = usernameInput.trim() || 'Anonim Trader'
                        setUsername(finalUsername)
                        localStorage.setItem('tradeUsername', finalUsername)
                        setShowUsernameModal(false)
                        setShowShareModal(true)
                        console.log('💾 Kullanıcı adı kaydedildi:', finalUsername)
                      }}
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-all duration-300 shadow-lg transform hover:scale-105 flex items-center justify-center space-x-2"
                    >
                      <span>🚀</span>
                      <span>Devam Et</span>
                    </button>
                  </div>
                  
                  {/* Skip Option */}
                  <div className="text-center mt-4">
                    <button
                      onClick={() => {
                        setUsername('Anonim Trader')
                        localStorage.setItem('tradeUsername', 'Anonim Trader')
                        setShowUsernameModal(false)
                        setShowShareModal(true)
                      }}
                      className="text-gray-400 hover:text-white text-sm underline transition-colors duration-300"
                    >
                      İsim belirtmeden devam et
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Paylaşım Modal */}
        {showShareModal && activeTradeData && (
          <>
            {/* Overlay - Tamamen opak arka plan */}
            <div 
              className="fixed inset-0 bg-black z-[999999]" 
              onClick={() => setShowShareModal(false)}
              onTouchStart={(e) => e.preventDefault()}
              onTouchMove={(e) => e.preventDefault()}
              style={{ zIndex: 999999, touchAction: 'none' }}
            ></div>
            
            {/* Modal Content */}
            <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-4" style={{ zIndex: 1000000 }}>
              <div className="bg-gradient-to-br from-gray-900 via-slate-900 to-black backdrop-blur-xl rounded-2xl sm:rounded-3xl border-2 border-gray-600/50 shadow-2xl w-full max-w-lg mx-2 sm:mx-0 relative max-h-[95vh] overflow-y-auto" style={{ zIndex: 1000001 }}>
                
                {/* Kapat Butonu */}
                <button
                  onClick={() => setShowShareModal(false)}
                  className="absolute top-2 sm:top-4 right-2 sm:right-4 w-8 h-8 sm:w-10 sm:h-10 bg-gray-700/80 hover:bg-gray-600 rounded-full flex items-center justify-center text-white transition-all duration-300 text-sm sm:text-base" style={{ zIndex: 1000002 }}
                >
                  ✕
                </button>

                {/* Screenshot Alanı */}
                <div id="trading-screenshot" className="p-4 sm:p-6 lg:p-8">
                  
                  {/* Header */}
                  <div className="text-center mb-4 sm:mb-6 lg:mb-8">
                    <div className="flex items-center justify-center mb-2 sm:mb-3">
                      <div className="text-center">
                        <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-orange-400">İndicSigs</h1>
                        <p className="text-gray-300 text-xs sm:text-sm font-medium">Kaldıraçlı Sinyal Testi — Risksiz, Anlık</p>
                      </div>
                    </div>
                    
                    {/* Username Badge - Prominent Display */}
                    {username && (
                      <div className="mb-3">
                        <div className="inline-flex items-center bg-gradient-to-r from-purple-600 via-blue-600 to-purple-700 px-6 py-3 rounded-2xl border-2 border-purple-400/50 shadow-xl shadow-purple-500/30">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                              <span className="text-white text-lg">👤</span>
                            </div>
                            <div className="text-left">
                              <div className="text-xs text-purple-200 font-medium opacity-90">Trader</div>
                              <div className="text-white font-bold text-lg tracking-wide">@{username}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <p className="text-gray-400 text-xs sm:text-sm">{new Date().toLocaleDateString('tr-TR')} - {new Date().toLocaleTimeString('tr-TR')}</p>
                  </div>

                  {/* Trade Bilgileri */}
                  <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl sm:rounded-2xl p-4 sm:p-5 lg:p-6 border border-gray-600/30">
                    
                    {/* Coin ve Pozisyon */}
                    <div className="flex items-center justify-between mb-4 sm:mb-5 lg:mb-6">
                      <div>
                        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-1">
                          {activeTradeData.symbol.replace('USDT', '/USDT')}
                        </h2>
                        <div className={`inline-flex items-center px-2 sm:px-3 lg:px-4 py-1 sm:py-1.5 lg:py-2 rounded-full font-bold text-sm sm:text-base lg:text-lg ${
                          activeTradeData.type === 'long' 
                            ? 'bg-green-600/20 text-green-400 border border-green-500/30' 
                            : 'bg-red-600/20 text-red-400 border border-red-500/30'
                        }`}>
                          {activeTradeData.type === 'long' ? '📈 LONG' : '📉 SHORT'} {activeTradeData.leverage}x
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-gray-400 text-xs sm:text-sm mb-1">Güncel Fiyat</div>
                        <div className="text-lg sm:text-xl lg:text-2xl font-mono font-bold text-white">
                          ${formatPrice(activeTradeData.currentPrice)}
                        </div>
                      </div>
                    </div>

                    {/* Ana Kar/Zarar Göstergesi */}
                    <div className={`text-center p-4 sm:p-5 lg:p-6 rounded-xl border-2 mb-4 sm:mb-5 lg:mb-6 ${
                      activeTradeData.pnl >= 0 
                        ? 'bg-green-900/30 border-green-500/50' 
                        : 'bg-red-900/30 border-red-500/50'
                    }`}>
                      <div className="text-gray-300 text-xs sm:text-sm mb-1 sm:mb-2">Realized PnL</div>
                      <div className={`text-2xl sm:text-3xl lg:text-4xl font-bold mb-1 sm:mb-2 ${
                        activeTradeData.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPnL(activeTradeData.pnl)}
                      </div>
                      <div className={`text-base sm:text-lg lg:text-xl font-bold ${
                        activeTradeData.roi >= 0 ? 'text-green-300' : 'text-red-300'
                      }`}>
                        ROE: {activeTradeData.roi >= 0 ? '+' : ''}{activeTradeData.roi.toFixed(2)}%
                      </div>
                    </div>

                    {/* Detay Bilgileri */}
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
                      <div className="bg-gray-700/50 p-2 sm:p-3 lg:p-4 rounded-lg sm:rounded-xl">
                        <div className="text-gray-400 text-xs sm:text-sm mb-1">Giriş Fiyatı</div>
                        <div className="font-mono font-bold text-white text-sm sm:text-base">
                          ${formatPrice(activeTradeData.entryPrice)}
                        </div>
                      </div>
                      
                      <div className="bg-gray-700/50 p-2 sm:p-3 lg:p-4 rounded-lg sm:rounded-xl">
                        <div className="text-gray-400 text-xs sm:text-sm mb-1">Kapanış Fiyatı</div>
                        <div className="font-mono font-bold text-white text-sm sm:text-base">
                          ${formatPrice(activeTradeData.currentPrice)}
                        </div>
                      </div>
                      
                      <div className="bg-gray-700/50 p-2 sm:p-3 lg:p-4 rounded-lg sm:rounded-xl">
                        <div className="text-gray-400 text-xs sm:text-sm mb-1">Yatırım</div>
                        <div className="font-mono font-bold text-white text-sm sm:text-base">
                          ${activeTradeData.investment.toLocaleString('tr-TR')}
                        </div>
                      </div>
                      
                      <div className="bg-gray-700/50 p-2 sm:p-3 lg:p-4 rounded-lg sm:rounded-xl">
                        <div className="text-gray-400 text-xs sm:text-sm mb-1">Kaldıraç</div>
                        <div className="font-bold text-yellow-400 text-sm sm:text-base">
                          {activeTradeData.leverage}x
                        </div>
                      </div>
                      
                      <div className="bg-gray-700/50 p-2 sm:p-3 lg:p-4 rounded-lg sm:rounded-xl">
                        <div className="text-gray-400 text-xs sm:text-sm mb-1">Pozisyon Boyutu</div>
                        <div className="font-mono text-white text-xs sm:text-sm">
                          {((activeTradeData.leverage * activeTradeData.investment) / activeTradeData.entryPrice).toFixed(6)} {activeTradeData.symbol.replace('USDT', '')}
                        </div>
                      </div>
                      
                      <div className="bg-gray-700/50 p-2 sm:p-3 lg:p-4 rounded-lg sm:rounded-xl">
                        <div className="text-gray-400 text-xs sm:text-sm mb-1">Toplam Değer</div>
                        <div className="font-mono text-white text-xs sm:text-sm">
                          ${(activeTradeData.leverage * activeTradeData.investment).toLocaleString('tr-TR')}
                        </div>
                      </div>
                    </div>

                    {/* Alt Bilgi */}
                    <div className="mt-4 sm:mt-5 lg:mt-6 pt-3 sm:pt-4 border-t border-gray-600/30 text-center">
                      <p className="text-gray-400 text-xs">
                        🔒 Bu platform, İndicSigs tarafından üretilen sinyallerin test amaçlı simülasyonudur. Gerçek para ile işlem yapılmaz.
                      </p>
                      <p className="text-gray-500 text-xs mt-1">
                        Başlama Zamanı: {new Date(activeTradeData.startTime).toLocaleString('tr-TR')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Alt Butonlar */}
                <div className="p-3 sm:p-4 lg:p-6 pt-0">
                  <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
                    <button
                      onClick={takeScreenshot}
                      className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-2 sm:py-3 px-2 sm:px-4 rounded-lg sm:rounded-xl transition-all duration-300 flex items-center justify-center space-x-1 sm:space-x-2 text-sm sm:text-base"
                    >
                      <span>📸</span>
                      <span>Screenshot Al</span>
                    </button>
                    
                    <button
                      onClick={async () => {
                        console.log('Paylaş butonuna tıklandı - resim paylaşımı')
                        
                        try {
                          const element = document.getElementById('trading-screenshot')
                          if (!element) {
                            alert('❌ Screenshot alanı bulunamadı!')
                            return
                          }

                          // Loading göster
                          const loadingAlert = document.createElement('div')
                          loadingAlert.innerHTML = '📸 Paylaşım için screenshot hazırlanıyor...'
                          loadingAlert.className = 'share-loading'
                          loadingAlert.style.cssText = `
                            position: fixed;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%);
                            background: rgba(0,0,0,0.9);
                            color: white;
                            padding: 20px 30px;
                            border-radius: 15px;
                            z-index: 1000004;
                            font-size: 16px;
                            font-weight: bold;
                            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                          `
                          document.body.appendChild(loadingAlert)

                          await new Promise(resolve => setTimeout(resolve, 300))
                          
                          let imageBlob: Blob | null = null
                          let dataUrl: string = ''
                          
                          // Method 1: dom-to-image
                          console.log('Paylaşım için dom-to-image deneniyor...')
                          try {
                            dataUrl = await (domtoimage as any).toPng(element, {
                              quality: 1.0,
                              bgcolor: '#1f2937',
                              width: element.offsetWidth,
                              height: element.offsetHeight
                            })
                            // DataURL'yi blob'a çevir
                            const response = await fetch(dataUrl)
                            imageBlob = await response.blob()
                            console.log('dom-to-image başarılı!')
                          } catch (domError) {
                            console.warn('dom-to-image hatası:', domError)
                            
                            // Method 2: html2canvas
                            console.log('Paylaşım için html2canvas deneniyor...')
                            try {
                              const canvas = await html2canvas(element, {
                                logging: false,
                                useCORS: false,
                                allowTaint: true
                              } as any)
                              
                              dataUrl = canvas.toDataURL('image/png', 1.0)
                              // Canvas'dan blob oluştur
                              imageBlob = await new Promise((resolve) => {
                                canvas.toBlob((blob) => {
                                  resolve(blob)
                                }, 'image/png', 1.0)
                              })
                              console.log('html2canvas başarılı!')
                            } catch (html2Error) {
                              console.error('html2canvas hatası:', html2Error)
                              throw new Error('Screenshot alınamadı')
                            }
                          }
                          
                          // Loading'i kaldır
                          const loading = document.querySelector('.share-loading')
                          if (loading && loading.parentNode) {
                            loading.parentNode.removeChild(loading)
                          }
                          
                          if (imageBlob && dataUrl) {
                            console.log('Resim hazırlandı, paylaşım seçenekleri gösteriliyor...')
                            
                            // Web Share API ile resim paylaşımı dene
                            let webShareWorked = false
                            if (navigator.share && navigator.canShare) {
                              const shareData = {
                                title: 'Trading Sonucum',
                                text: `🔥 ${activeTradeData.symbol} ${activeTradeData.type.toUpperCase()} ${activeTradeData.leverage}x\n💰 PnL: ${formatPnL(activeTradeData.pnl)} (${activeTradeData.roi >= 0 ? '+' : ''}${activeTradeData.roi.toFixed(2)}%)`,
                                files: [new File([imageBlob], 'trading-result.png', { type: 'image/png' })]
                              }
                              
                              if (navigator.canShare(shareData)) {
                                try {
                                  await navigator.share(shareData)
                                  console.log('Web Share API ile resim paylaşımı başarılı!')
                                  webShareWorked = true
                                  return
                                } catch (shareError) {
                                  console.warn('Web Share API resim paylaşımı hatası:', shareError)
                                }
                              }
                            }
                            
                            // Web Share API çalışmadıysa, sosyal medya seçenekleri göster
                            if (!webShareWorked) {
                              // Paylaşım modalı oluştur
                              const shareModal = document.createElement('div')
                              shareModal.className = 'social-share-modal'
                              shareModal.style.cssText = `
                                position: fixed;
                                top: 0;
                                left: 0;
                                width: 100%;
                                height: 100%;
                                background: rgba(0,0,0,0.9);
                                z-index: 1000005;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                padding: 20px;
                              `
                              
                              shareModal.innerHTML = `
                                <div style="
                                  background: linear-gradient(135deg, #1f2937, #374151);
                                  border-radius: 20px;
                                  padding: 30px;
                                  max-width: 400px;
                                  width: 100%;
                                  text-align: center;
                                  border: 2px solid #6366f1;
                                  box-shadow: 0 20px 50px rgba(0,0,0,0.8);
                                ">
                                  <h3 style="color: white; font-size: 24px; margin-bottom: 20px; font-weight: bold;">
                                    📤 Paylaşım Seçenekleri
                                  </h3>
                                  <p style="color: #d1d5db; margin-bottom: 25px; font-size: 14px;">
                                    Resim kaydedildi! Aşağıdaki platformlarda paylaşabilirsiniz:
                                  </p>
                                  
                                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px;">
                                    <button onclick="
                                      try {
                                        // Mobil WhatsApp uygulamasını açmaya çalış
                                        if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                                          window.location.href = 'whatsapp://send?text=Trading%20sonucumu%20paylaşıyorum!';
                                          setTimeout(() => {
                                            // Eğer uygulama açılmazsa web versiyonunu aç
                                            window.open('https://web.whatsapp.com/', '_blank');
                                          }, 2000);
                                        } else {
                                          window.open('https://web.whatsapp.com/', '_blank');
                                        }
                                        alert('📱 WhatsApp açıldı!\\n\\n1. Sohbet seçin\\n2. Ataş simgesine basın (📎)\\n3. Galeri > Son kaydedilen resmi seçin');
                                      } catch(e) {
                                        alert('📱 WhatsApp Paylaşımı:\\n\\n1. WhatsApp uygulamasını açın\\n2. Sohbet seçin\\n3. Ataş (📎) > Galeri\\n4. Son kaydedilen resmi seçin');
                                      }
                                    " style="
                                      background: linear-gradient(45deg, #25D366, #128C7E);
                                      color: white;
                                      border: none;
                                      padding: 15px;
                                      border-radius: 12px;
                                      cursor: pointer;
                                      font-weight: bold;
                                      transition: transform 0.2s;
                                    " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                      📱 WhatsApp
                                    </button>
                                    
                                    <button onclick="
                                      try {
                                        // Mobil Instagram uygulamasını açmaya çalış
                                        if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                                          window.location.href = 'instagram://camera';
                                          setTimeout(() => {
                                            // Eğer uygulama açılmazsa web versiyonunu aç
                                            window.open('https://www.instagram.com/', '_blank');
                                          }, 2000);
                                        } else {
                                          window.open('https://www.instagram.com/', '_blank');
                                        }
                                        alert('📷 Instagram açıldı!\\n\\n1. + butonuna basın\\n2. Story seçin\\n3. Galeri > Son kaydedilen resmi seçin');
                                      } catch(e) {
                                        alert('📷 Instagram Paylaşımı:\\n\\n1. Instagram uygulamasını açın\\n2. + (Oluştur) butonuna basın\\n3. Story seçin\\n4. Galeri > Son resmi seçin');
                                      }
                                    " style="
                                      background: linear-gradient(45deg, #E4405F, #C13584, #833AB4);
                                      color: white;
                                      border: none;
                                      padding: 15px;
                                      border-radius: 12px;
                                      cursor: pointer;
                                      font-weight: bold;
                                      transition: transform 0.2s;
                                    " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                      📷 Instagram
                                    </button>
                                    
                                    <button onclick="
                                      try {
                                        // Mobil Twitter uygulamasını açmaya çalış
                                        if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                                          window.location.href = 'twitter://post?message=Trading%20sonucumu%20paylaşıyorum!';
                                          setTimeout(() => {
                                            // Eğer uygulama açılmazsa web versiyonunu aç
                                            window.open('https://twitter.com/intent/tweet?text=Trading%20sonucumu%20paylaşıyorum!', '_blank');
                                          }, 2000);
                                        } else {
                                          window.open('https://twitter.com/intent/tweet?text=Trading%20sonucumu%20paylaşıyorum!', '_blank');
                                        }
                                        alert('🐦 Twitter açıldı!\\n\\n1. Tweet yazın\\n2. Resim simgesine basın (🖼️)\\n3. Galeri > Son kaydedilen resmi seçin');
                                      } catch(e) {
                                        alert('🐦 Twitter Paylaşımı:\\n\\n1. Twitter uygulamasını açın\\n2. Tweet oluştur\\n3. Resim ekle (🖼️)\\n4. Galeri > Son resmi seçin');
                                      }
                                    " style="
                                      background: linear-gradient(45deg, #1DA1F2, #0d8bd9);
                                      color: white;
                                      border: none;
                                      padding: 15px;
                                      border-radius: 12px;
                                      cursor: pointer;
                                      font-weight: bold;
                                      transition: transform 0.2s;
                                    " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                      🐦 Twitter
                                    </button>
                                    
                                    <button onclick="
                                      try {
                                        // Mobil Telegram uygulamasını açmaya çalış
                                        if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                                          window.location.href = 'tg://msg?text=Trading%20sonucumu%20paylaşıyorum!';
                                          setTimeout(() => {
                                            // Eğer uygulama açılmazsa web versiyonunu aç
                                            window.open('https://web.telegram.org/', '_blank');
                                          }, 2000);
                                        } else {
                                          window.open('https://web.telegram.org/', '_blank');
                                        }
                                        alert('✈️ Telegram açıldı!\\n\\n1. Sohbet seçin\\n2. Ataş simgesine basın (📎)\\n3. Galeri > Son kaydedilen resmi seçin');
                                      } catch(e) {
                                        alert('✈️ Telegram Paylaşımı:\\n\\n1. Telegram uygulamasını açın\\n2. Sohbet seçin\\n3. Ataş (📎) > Galeri\\n4. Son resmi seçin');
                                      }
                                    " style="
                                      background: linear-gradient(45deg, #0088cc, #006bb3);
                                      color: white;
                                      border: none;
                                      padding: 15px;
                                      border-radius: 12px;
                                      cursor: pointer;
                                      font-weight: bold;
                                      transition: transform 0.2s;
                                    " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                      ✈️ Telegram
                                    </button>
                                  </div>
                                  
                                  <button onclick="
                                    document.querySelector('.social-share-modal').remove();
                                  " style="
                                    background: linear-gradient(45deg, #6b7280, #4b5563);
                                    color: white;
                                    border: none;
                                    padding: 12px 30px;
                                    border-radius: 10px;
                                    cursor: pointer;
                                    font-weight: bold;
                                    width: 100%;
                                  ">
                                    ✖️ Kapat
                                  </button>
                                </div>
                              `
                              
                              document.body.appendChild(shareModal)
                              
                              // Resmi otomatik indir
                              const url = URL.createObjectURL(imageBlob)
                              const link = document.createElement('a')
                              const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
                              link.download = `trading-result-${timestamp}.png`
                              link.href = url
                              
                              document.body.appendChild(link)
                              link.click()
                              document.body.removeChild(link)
                              URL.revokeObjectURL(url)
                            }
                          }
                          
                        } catch (error) {
                          console.error('Paylaşım hatası:', error)
                          alert('❌ Resim paylaşımında hata oluştu. Screenshot Al butonunu kullanarak resmi indirin.')
                        } finally {
                          // Loading'i kaldır (eğer hala varsa)
                          const loading = document.querySelector('.share-loading')
                          if (loading && loading.parentNode) {
                            loading.parentNode.removeChild(loading)
                          }
                        }
                      }}
                      className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-2 sm:py-3 px-2 sm:px-4 rounded-lg sm:rounded-xl transition-all duration-300 flex items-center justify-center space-x-1 sm:space-x-2 text-sm sm:text-base"
                    >
                      <span>📤</span>
                      <span>Paylaş</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* İstatistikler Modal */}
        {showStatsModal && (
          <>
            {/* Overlay */}
            <div 
              className="fixed inset-0 bg-black/80 z-[999999]" 
              onClick={() => setShowStatsModal(false)}
              style={{ zIndex: 999999 }}
            ></div>
            
            {/* Modal Content */}
            <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-4" style={{ zIndex: 1000000 }}>
              <div className="bg-gradient-to-br from-gray-900 via-slate-900 to-black backdrop-blur-xl rounded-2xl sm:rounded-3xl border-2 border-gray-600/50 shadow-2xl w-full max-w-4xl mx-2 sm:mx-0 relative max-h-[95vh] overflow-y-auto" style={{ zIndex: 1000001 }}>
                
                {/* Kapat Butonu */}
                <button
                  onClick={() => setShowStatsModal(false)}
                  className="absolute top-2 sm:top-4 right-2 sm:right-4 w-8 h-8 sm:w-10 sm:h-10 bg-gray-700/80 hover:bg-gray-600 rounded-full flex items-center justify-center text-white transition-all duration-300 text-sm sm:text-base z-10"
                >
                  ✕
                </button>

                <div className="p-4 sm:p-6 lg:p-8">
                  {/* Header */}
                  <div className="text-center mb-6">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 flex items-center justify-center">
                      <span className="text-xl sm:text-2xl mr-3">📊</span>
                      Trade İstatistikleri
                    </h2>
                    <p className="text-gray-400">Toplam {tradeHistory.length} trade geçmişi</p>
                    
                    {/* Clear All Button */}
                    {tradeHistory.length > 0 && (
                      <div className="mt-4">
                        <button
                          onClick={() => {
                            if (window.confirm('⚠️ Tüm trade geçmişini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz!')) {
                              setTradeHistory([])
                              localStorage.removeItem('tradeHistory')
                              setShowStatsModal(false)
                              console.log('🗑️ Tüm trade geçmişi temizlendi')
                            }
                          }}
                          className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 shadow-lg transform hover:scale-105 flex items-center mx-auto space-x-2 text-sm"
                        >
                          <span>🗑️</span>
                          <span>Tümünü Temizle</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Filtreler */}
                  <div className="bg-gray-800/50 rounded-xl p-4 mb-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                      <span className="mr-2">🔍</span>Filtreler
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Coin Filtresi */}
                      <div>
                        <label className="block text-sm text-gray-300 mb-2">Coin</label>
                        <select
                          value={statsFilter.coin}
                          onChange={(e) => setStatsFilter(prev => ({ ...prev, coin: e.target.value }))}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                        >
                          <option value="all">Tüm Coinler</option>
                          {availableCoins.map(coin => (
                            <option key={coin} value={coin}>{coin}</option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Trade Type Filtresi */}
                      <div>
                        <label className="block text-sm text-gray-300 mb-2">Pozisyon Tipi</label>
                        <select
                          value={statsFilter.type}
                          onChange={(e) => setStatsFilter(prev => ({ ...prev, type: e.target.value as 'all' | 'long' | 'short' }))}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                        >
                          <option value="all">Tüm Pozisyonlar</option>
                          <option value="long">Sadece LONG</option>
                          <option value="short">Sadece SHORT</option>
                        </select>
                      </div>
                      
                      {/* Zaman Filtresi */}
                      <div>
                        <label className="block text-sm text-gray-300 mb-2">Zaman Aralığı</label>
                        <select
                          value={statsFilter.period}
                          onChange={(e) => setStatsFilter(prev => ({ ...prev, period: e.target.value as 'all' | '24h' | '7d' | '30d' }))}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                        >
                          <option value="all">Tüm Zamanlar</option>
                          <option value="24h">Son 24 Saat</option>
                          <option value="7d">Son 7 Gün</option>
                          <option value="30d">Son 30 Gün</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* İstatistikler Kartları */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {/* Toplam Trade */}
                    <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/30 rounded-xl p-4 text-center">
                      <div className="text-2xl sm:text-3xl font-bold text-blue-400 mb-1">{currentStats.totalTrades}</div>
                      <div className="text-sm text-gray-300">Toplam Trade</div>
                    </div>
                    
                    {/* Kazanılan Tradeler */}
                    <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 border border-green-500/30 rounded-xl p-4 text-center">
                      <div className="text-2xl sm:text-3xl font-bold text-green-400 mb-1">{currentStats.winningTrades}</div>
                      <div className="text-sm text-gray-300">Kazanılan</div>
                    </div>
                    
                    {/* Kaybedilen Tradeler */}
                    <div className="bg-gradient-to-br from-red-900/30 to-red-800/30 border border-red-500/30 rounded-xl p-4 text-center">
                      <div className="text-2xl sm:text-3xl font-bold text-red-400 mb-1">{currentStats.losingTrades}</div>
                      <div className="text-sm text-gray-300">Kaybedilen</div>
                    </div>
                    
                    {/* Liquidasyon */}
                    <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/30 border border-orange-500/30 rounded-xl p-4 text-center">
                      <div className="text-2xl sm:text-3xl font-bold text-orange-400 mb-1">{currentStats.liquidatedTrades}</div>
                      <div className="text-sm text-gray-300">Liquidasyon</div>
                    </div>
                  </div>

                  {/* Ana İstatistikler */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    {/* Kazanç Oranı */}
                    <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border border-purple-500/30 rounded-xl p-6 text-center">
                      <div className="text-4xl font-bold text-purple-400 mb-2">
                        {currentStats.winRate.toFixed(1)}%
                      </div>
                      <div className="text-lg text-gray-300 mb-1">Kazanç Oranı</div>
                      <div className="text-sm text-gray-400">
                        {currentStats.winningTrades}/{currentStats.totalTrades} trade
                      </div>
                    </div>
                    
                    {/* Toplam PnL */}
                    <div className={`border rounded-xl p-6 text-center ${
                      currentStats.totalPnL >= 0 
                        ? 'bg-gradient-to-br from-green-900/30 to-green-800/30 border-green-500/30' 
                        : 'bg-gradient-to-br from-red-900/30 to-red-800/30 border-red-500/30'
                    }`}>
                      <div className={`text-4xl font-bold mb-2 ${
                        currentStats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {currentStats.totalPnL >= 0 ? '+' : ''}${currentStats.totalPnL.toFixed(2)}
                      </div>
                      <div className="text-lg text-gray-300 mb-1">Toplam PnL</div>
                      <div className="text-sm text-gray-400">
                        ROI: {currentStats.totalROI >= 0 ? '+' : ''}{currentStats.totalROI.toFixed(2)}%
                      </div>
                    </div>
                    
                    {/* Ortalama ROI */}
                    <div className={`border rounded-xl p-6 text-center ${
                      currentStats.avgROI >= 0 
                        ? 'bg-gradient-to-br from-cyan-900/30 to-cyan-800/30 border-cyan-500/30' 
                        : 'bg-gradient-to-br from-pink-900/30 to-pink-800/30 border-pink-500/30'
                    }`}>
                      <div className={`text-4xl font-bold mb-2 ${
                        currentStats.avgROI >= 0 ? 'text-cyan-400' : 'text-pink-400'
                      }`}>
                        {currentStats.avgROI >= 0 ? '+' : ''}{currentStats.avgROI.toFixed(2)}%
                      </div>
                      <div className="text-lg text-gray-300 mb-1">Ort. ROI</div>
                      <div className="text-sm text-gray-400">
                        Ortalama süre: {currentStats.avgDuration.toFixed(0)} dk
                      </div>
                    </div>
                  </div>

                  {/* En İyi/Kötü Tradeler */}
                  {(currentStats.bestTrade || currentStats.worstTrade) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                      {/* En İyi Trade */}
                      {currentStats.bestTrade && (
                        <div className="bg-gradient-to-br from-green-900/20 to-green-800/20 border border-green-500/30 rounded-xl p-4">
                          <h4 className="text-lg font-semibold text-green-400 mb-3 flex items-center">
                            <span className="mr-2">🏆</span>En İyi Trade
                          </h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-300">Coin:</span>
                              <span className="text-white font-mono">{currentStats.bestTrade.symbol}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-300">Tip:</span>
                              <span className={`font-bold ${currentStats.bestTrade.type === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                                {currentStats.bestTrade.type.toUpperCase()}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-300">PnL:</span>
                              <span className="text-green-400 font-bold">+${currentStats.bestTrade.pnl.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-300">ROI:</span>
                              <span className="text-green-400 font-bold">+{currentStats.bestTrade.roi.toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-300">Tarih:</span>
                              <span className="text-gray-400 text-xs">
                                {currentStats.bestTrade.endTime.toLocaleDateString('tr-TR')}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* En Kötü Trade */}
                      {currentStats.worstTrade && (
                        <div className="bg-gradient-to-br from-red-900/20 to-red-800/20 border border-red-500/30 rounded-xl p-4">
                          <h4 className="text-lg font-semibold text-red-400 mb-3 flex items-center">
                            <span className="mr-2">📉</span>En Kötü Trade
                          </h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-300">Coin:</span>
                              <span className="text-white font-mono">{currentStats.worstTrade.symbol}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-300">Tip:</span>
                              <span className={`font-bold ${currentStats.worstTrade.type === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                                {currentStats.worstTrade.type.toUpperCase()}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-300">PnL:</span>
                              <span className="text-red-400 font-bold">${currentStats.worstTrade.pnl.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-300">ROI:</span>
                              <span className="text-red-400 font-bold">{currentStats.worstTrade.roi.toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-300">Tarih:</span>
                              <span className="text-gray-400 text-xs">
                                {currentStats.worstTrade.endTime.toLocaleDateString('tr-TR')}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Trade Geçmişi Tablosu */}
                  {filteredTradeHistory.length > 0 && (
                    <div className="bg-gray-800/50 rounded-xl p-4">
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="mr-2">📋</span>Trade Geçmişi 
                        <span className="ml-2 text-sm text-gray-400">({filteredTradeHistory.length} sonuç)</span>
                      </h3>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-600">
                              <th className="text-left p-2 text-gray-300">Coin</th>
                              <th className="text-left p-2 text-gray-300">Tip</th>
                              <th className="text-right p-2 text-gray-300">Giriş</th>
                              <th className="text-right p-2 text-gray-300">Çıkış</th>
                              <th className="text-right p-2 text-gray-300">PnL</th>
                              <th className="text-right p-2 text-gray-300">ROI</th>
                              <th className="text-center p-2 text-gray-300">Süre</th>
                              <th className="text-center p-2 text-gray-300">Durum</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredTradeHistory.slice(0, 20).map((trade) => (
                              <tr key={trade.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                                <td className="p-2 font-mono text-white">{trade.symbol}</td>
                                <td className="p-2">
                                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                                    trade.type === 'long' 
                                      ? 'bg-green-600/20 text-green-400' 
                                      : 'bg-red-600/20 text-red-400'
                                  }`}>
                                    {trade.type.toUpperCase()}
                                  </span>
                                </td>
                                <td className="p-2 text-right font-mono text-gray-300">
                                  ${formatPrice(trade.entryPrice)}
                                </td>
                                <td className="p-2 text-right font-mono text-gray-300">
                                  ${formatPrice(trade.exitPrice)}
                                </td>
                                <td className={`p-2 text-right font-mono font-bold ${
                                  trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                                }`}>
                                  {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                                </td>
                                <td className={`p-2 text-right font-mono font-bold ${
                                  trade.roi >= 0 ? 'text-green-400' : 'text-red-400'
                                }`}>
                                  {trade.roi >= 0 ? '+' : ''}{trade.roi.toFixed(2)}%
                                </td>
                                <td className="p-2 text-center text-gray-400">
                                  {trade.duration < 60 
                                    ? `${trade.duration}dk` 
                                    : `${Math.floor(trade.duration / 60)}s ${trade.duration % 60}dk`
                                  }
                                </td>
                                <td className="p-2 text-center">
                                  <span className={`px-2 py-1 rounded text-xs ${
                                    trade.status === 'completed' 
                                      ? 'bg-blue-600/20 text-blue-400' 
                                      : 'bg-orange-600/20 text-orange-400'
                                  }`}>
                                    {trade.status === 'completed' ? 'Tamamlandı' : 'Liquidasyon'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {filteredTradeHistory.length > 20 && (
                        <div className="text-center mt-4 text-gray-400 text-sm">
                          Sadece son 20 trade gösteriliyor. Toplam: {filteredTradeHistory.length}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Boş Durum */}
                  {filteredTradeHistory.length === 0 && (
                    <div className="text-center py-12">
                      <div className="text-6xl mb-4">📊</div>
                      <h3 className="text-xl font-semibold mb-2 text-gray-300">Filtre sonuçları boş</h3>
                      <p className="text-gray-400">
                        Seçilen filtrelere uygun trade bulunamadı.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Liquidation Modal */}
        {showLiquidationModal && liquidationData && (
          <>
            {/* Overlay that blocks all interaction */}
            <div className="fixed inset-0 bg-black/90 z-[99999]" style={{ zIndex: 99999 }}></div>
            
            {/* Modal Content */}
            <div 
              className="fixed inset-0 flex items-center justify-center p-4"
              style={{ zIndex: 100000 }}
            >
              <div className="bg-gradient-to-br from-red-900 to-red-800 backdrop-blur-xl rounded-3xl p-8 border-4 border-red-400 shadow-2xl shadow-red-500/50 max-w-md w-full transform scale-110 relative">
                <div className="text-center">
                  <div className="text-7xl mb-4 animate-pulse">⚠️</div>
                  <h2 className="text-4xl font-bold text-white mb-4 drop-shadow-lg">
                    LİKİDASYON!
                  </h2>
                  <p className="text-2xl text-red-100 mb-6 font-semibold">
                    Pozisyonunuz liquidate edildi
                  </p>
                  
                  <div className="bg-black/70 rounded-2xl p-6 mb-6 border-2 border-red-400/50">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-100 font-medium">Liquidation Fiyatı:</span>
                        <span className="font-mono text-red-300 font-bold text-lg">
                          ${formatPrice(liquidationData.price)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-100 font-medium">Toplam Zarar:</span>
                        <span className="font-mono text-red-400 font-bold text-2xl">
                          ${Math.abs(liquidationData.loss).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-center mt-4 text-red-200 text-base bg-red-900/70 rounded-lg p-3 border border-red-400/30">
                        🚨 Tüm yatırımınız kaybedildi 🚨
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {
                      setShowLiquidationModal(false)
                      setLiquidationData(null)
                    }}
                    className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-5 px-6 rounded-2xl transition-all duration-300 shadow-lg transform hover:scale-105 border-2 border-red-400 text-xl"
                  >
                    ✖️ Kapat
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* CSS Animasyonları */}
      <style jsx>{`
        .price-display {
          transition: all 0.3s ease;
        }
        .price-up {
          color: #10b981 !important;
          text-shadow: 0 0 30px rgba(16, 185, 129, 0.8);
          transform: scale(1.05);
        }
        .price-down {
          color: #ef4444 !important;
          text-shadow: 0 0 30px rgba(239, 68, 68, 0.8);
          transform: scale(1.05);
        }
        .slider-modern::-webkit-slider-thumb {
          appearance: none;
          height: 28px;
          width: 28px;
          border-radius: 50%;
          background: linear-gradient(45deg, #fbbf24, #f59e0b, #d97706);
          cursor: pointer;
          box-shadow: 0 0 20px rgba(251, 191, 36, 0.8), 0 4px 15px rgba(0, 0, 0, 0.3);
          border: 3px solid white;
          transition: all 0.2s ease;
        }
        .slider-modern::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 30px rgba(251, 191, 36, 1), 0 6px 20px rgba(0, 0, 0, 0.4);
        }
        .slider-modern::-moz-range-thumb {
          height: 28px;
          width: 28px;
          border-radius: 50%;
          background: linear-gradient(45deg, #fbbf24, #f59e0b, #d97706);
          cursor: pointer;
          border: 3px solid white;
          box-shadow: 0 0 20px rgba(251, 191, 36, 0.8), 0 4px 15px rgba(0, 0, 0, 0.3);
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        .float-animation {
          animation: float 3s ease-in-out infinite;
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(147, 51, 234, 0.5); }
          50% { box-shadow: 0 0 40px rgba(147, 51, 234, 0.8); }
        }
        .glow-animation {
          animation: glow 2s ease-in-out infinite;
        }
      `}</style>
    </>
  )
}