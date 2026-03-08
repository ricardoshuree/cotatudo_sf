/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Loader2, Package, Truck, Store, ExternalLink, 
  ChevronRight, Filter, ArrowUpDown, Trash2, CheckCircle2, 
  AlertCircle, Info, ShoppingCart, TrendingUp, Zap, Clock, List, LayoutGrid, FileText, X, Settings, ShieldCheck
} from 'lucide-react';

interface Offer {
  id: string;
  productName: string;
  price: number;
  deliveryDays: number;
  seller: string;
  site: string;
  link: string;
  imageUrl: string;
  confidence: number;
  isBestPrice: boolean;
  isFastest: boolean;
  condition?: string;
  freeShipping?: boolean;
  soldQuantity?: number;
}

interface RequestedItem {
  id: string;
  originalText: string;
  normalizedName: string;
  quantity: number | null;
  specifications: string;
  status: 'ok' | 'incomplete' | 'ambiguous';
  offers: Offer[];
}

interface SearchResponse {
  summary: {
    totalItems: number;
    analysisStatus: string;
  };
  items: RequestedItem[];
}

type ViewMode = 'by-item' | 'by-seller' | 'by-site' | 'best-value';
type SortBy = 'price' | 'delivery' | 'confidence';

export default function App() {
  const [query, setQuery] = useState('');
  const [step, setStep] = useState<'search' | 'processing' | 'results' | 'report'>('search');
  const [processingStep, setProcessingStep] = useState(0);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('by-item');
  const [sortBy, setSortBy] = useState<SortBy>('price');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('list');
  const [selectedOffers, setSelectedOffers] = useState<Record<string, string[]>>({});
  const [showCart, setShowCart] = useState(false);
  const [isTestingML, setIsTestingML] = useState(false);
  const [mlStatus, setMlStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [serperStatus, setSerperStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showTokenHelp, setShowTokenHelp] = useState(false);

  const testMLConnection = async () => {
    setIsTestingML(true);
    setMlStatus('idle');
    try {
      const response = await fetch('/api/test-ml');
      const data = await response.json();
      if (data.status === 'ok' && data.count > 0) {
        setMlStatus('success');
      } else {
        setMlStatus('error');
      }
    } catch (err) {
      setMlStatus('error');
    } finally {
      setIsTestingML(false);
    }
  };

  const testSerperConnection = async () => {
    setIsTestingML(true);
    setSerperStatus('idle');
    try {
      const response = await fetch('/api/test-serper');
      const data = await response.json();
      if (data.status === 'ok' && data.count > 0) {
        setSerperStatus('success');
      } else {
        setSerperStatus('error');
      }
    } catch (err) {
      setSerperStatus('error');
    } finally {
      setIsTestingML(false);
    }
  };

  const processingMessages = [
    "Analisando os itens do orçamento...",
    "Separando descrições e quantidades...",
    "Identificando marcas e especificações...",
    "Pesquisando no Mercado Livre e Google Shopping...",
    "Comparando preços e prazos de entrega...",
    "Finalizando análise de custo-benefício..."
  ];

  useEffect(() => {
    if (step === 'processing') {
      const interval = setInterval(() => {
        setProcessingStep(prev => (prev < processingMessages.length - 1 ? prev + 1 : prev));
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [step]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setStep('processing');
    setProcessingStep(0);
    
    try {
      const win = window as any;
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response received:', text);
        throw new Error('O servidor retornou uma resposta inválida (não-JSON). Verifique se o servidor está rodando corretamente.');
      }

      const data = await response.json();
      
      if (!response.ok) {
        if (data.error?.includes('chave de API') || data.error?.includes('API key') || data.error?.includes('AIza')) {
          alert(`Erro de Configuração:\n\n${data.error}\n\nComo resolver:\n1. Vá ao Google AI Studio e gere uma chave (começa com AIza).\n2. No menu lateral deste editor (aba Code), clique no ícone de cadeado (Secrets).\n3. Adicione MY_API_KEY com o valor da sua chave.`);
          
          if (typeof win !== 'undefined' && win.aistudio) {
            const retry = confirm("Deseja tentar selecionar uma chave de um projeto pago (Google Cloud)?");
            if (retry) await win.aistudio.openSelectKey();
          }
          
          setStep('search');
          return;
        }

        if (data.error?.includes('Limite de busca') || data.error?.includes('Quota')) {
          const win = window as any;
          const msg = `Limite de Busca Atingido:\n\n${data.error}\n\nDeseja tentar selecionar uma chave de um projeto pago (Google Cloud) para remover este limite?`;
          
          if (typeof win !== 'undefined' && win.aistudio) {
            const retry = confirm(msg);
            if (retry) await win.aistudio.openSelectKey();
          } else {
            alert(`Limite de Busca Atingido:\n\n${data.error}`);
          }
          
          setStep('search');
          return;
        }

        throw new Error(data.error || 'Search failed');
      }
      
      setResults(data);
      
      // Small delay to show the last processing message
      setTimeout(() => setStep('results'), 1000);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Ocorreu um erro ao processar seu orçamento. Tente novamente.');
      setStep('search');
    }
  };

  const handleClear = () => {
    setQuery('');
  };

  const toggleOfferSelection = (itemId: string, offerId: string) => {
    setSelectedOffers(prev => {
      const currentOffers = prev[itemId] || [];
      const isSelected = currentOffers.includes(offerId);
      return {
        ...prev,
        [itemId]: isSelected
          ? currentOffers.filter(id => id !== offerId)
          : [...currentOffers, offerId]
      };
    });
  };

  const totalSelectedPrice = useMemo(() => {
    if (!results) return 0;
    return Object.entries(selectedOffers).reduce((total, [itemId, offerIds]) => {
      const item = results.items.find(i => i.id === itemId);
      if (!item) return total;
      const selectedOffersForThisItem = item.offers.filter(o => (offerIds as string[]).includes(o.id));
      return total + selectedOffersForThisItem.reduce((sum, offer) => sum + offer.price * (item.quantity || 1), 0);
    }, 0);
  }, [selectedOffers, results]);

  const ReportPage = () => {
    const groupedItems = useMemo(() => {
      if (!results) return [];
      return results.items.filter(item => selectedOffers[item.id] && selectedOffers[item.id].length > 0);
    }, [results, selectedOffers]);

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="max-w-4xl mx-auto p-8"
      >
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">Relatório Final</h1>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => window.print()}
              className="bg-white text-gray-900 border border-gray-200 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all flex items-center gap-2"
            >
              <FileText size={18} /> Imprimir PDF
            </button>
            <button 
              onClick={() => setStep('results')}
              className="text-gray-500 hover:text-gray-900 font-bold flex items-center gap-2"
            >
              <X size={20} /> Fechar
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {groupedItems.map(item => {
            const offerIds = selectedOffers[item.id];
            const selectedOffersForThisItem = item.offers.filter(o => offerIds.includes(o.id));
            
            return (
              <div key={item.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-4 text-gray-900">{item.normalizedName}</h2>
                <div className="space-y-3">
                  {selectedOffersForThisItem.map(offer => (
                    <div key={offer.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <img src={offer.imageUrl} alt={offer.productName} className="w-12 h-12 object-contain" referrerPolicy="no-referrer" />
                      <div className="flex-1">
                        <p className="font-bold text-sm text-gray-900">{offer.productName}</p>
                        <div className="flex items-center gap-4 mt-1">
                          <p className="text-xs text-gray-500">{offer.site}</p>
                          {offer.freeShipping ? (
                            <p className="text-xs text-emerald-600 font-bold">Frete Grátis</p>
                          ) : (
                            <p className="text-xs text-amber-600 font-bold">
                              {offer.shippingDays ? `${offer.shippingDays} dias` : 'Frete Pago'}
                            </p>
                          )}
                        </div>
                        <a href={offer.link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 block">Ver oferta</a>
                      </div>
                      <p className="font-bold text-sm text-gray-900">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(offer.price)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 bg-gray-900 text-white p-8 rounded-3xl flex items-center justify-between">
          <span className="text-lg font-bold uppercase tracking-widest">Valor Total</span>
          <span className="text-4xl font-black">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSelectedPrice)}
          </span>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F4F7F9] text-[#1A1C1E] font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 py-4 px-6 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setStep('search')}>
              <div className="bg-yellow-400 p-2.5 rounded-xl shadow-lg shadow-yellow-100 group-hover:scale-110 transition-transform">
                <Package className="text-blue-900 w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-gray-900">CotaTudo <span className="text-yellow-500">SF</span></h1>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">powered by shure & favero</p>
              </div>
            </div>

            {step === 'results' && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setStep('search')}
                  className="bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all active:scale-95 flex items-center gap-2"
                >
                  Nova Busca
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => alert("Configuração de Chave de API:\n\nPara buscas ilimitadas e em tempo real:\n1. Obtenha uma chave em: aistudio.google.com\n2. No menu lateral (Code), clique em 'Secrets' (ícone de cadeado).\n3. Adicione 'MY_API_KEY' com sua chave.\n4. Ative o faturamento (Billing) no Google Cloud para remover limites da conta gratuita.")}
              className="hidden md:flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-blue-600 transition-colors uppercase tracking-widest"
            >
              <Settings size={14} />
              Configurar API
            </button>

            {step === 'results' && (
              <div className="flex items-center gap-4">
                <div className="hidden md:block text-right">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Total Selecionado</p>
                  <p className="text-lg font-bold text-gray-900">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSelectedPrice)}
                  </p>
                </div>
                <button 
                  onClick={() => setStep('report')}
                  disabled={(Object.values(selectedOffers) as string[][]).reduce((acc, offerIds) => acc + (offerIds?.length || 0), 0) === 0}
                  className="flex items-center gap-3 px-6 py-3 rounded-2xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20"
                >
                  <FileText size={20} />
                  Relatório
                  {(Object.values(selectedOffers) as string[][]).reduce((acc, offerIds) => acc + (offerIds?.length || 0), 0) > 0 && (
                    <span className="bg-white text-blue-600 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                      {(Object.values(selectedOffers) as string[][]).reduce((acc, offerIds) => acc + (offerIds?.length || 0), 0)}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {step === 'search' ? (
            <motion.div
              key="search-screen"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="mt-12 max-w-3xl mx-auto space-y-10"
            >
              <div className="text-center space-y-4">
                <h2 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight leading-tight">
                  Cotações complexas em <span className="text-blue-600">segundos.</span>
                </h2>
                <p className="text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
                  Nossa IA interpreta sua lista, identifica especificações técnicas e encontra as melhores ofertas do mercado automaticamente.
                </p>
              </div>

              <div className="bg-white p-8 rounded-[2rem] shadow-2xl shadow-blue-900/5 border border-white space-y-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 via-blue-600 to-indigo-600"></div>
                
                <div className="space-y-2 relative">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Lista de Itens</label>
                  <div className="relative">
                    <textarea
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`Exemplo:\n4 rolamentos 6205\n2 correias A-32\n1 bomba d'água 1/2 cv\n10 parafusos sextavados 8mm`}
                      className="w-full h-64 p-6 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all resize-none text-gray-700 placeholder-gray-300 text-lg leading-relaxed font-medium"
                    />
                    <div className="absolute bottom-4 right-4 hidden md:block">
                      <button
                        onClick={handleSearch}
                        disabled={!query.trim()}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                      >
                        <Search size={18} />
                        Buscar Ofertas
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-gray-400 flex items-center gap-2">
                      <Info size={16} />
                      Busca direta no catálogo oficial do Mercado Livre.
                    </p>
                    <p className="text-[10px] text-yellow-600 font-medium flex items-center gap-1">
                      <Zap size={10} />
                      Dica: Use termos específicos (ex: "Rolamento 6205 SKF") para melhores resultados.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      onClick={testMLConnection}
                      disabled={isTestingML}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        mlStatus === 'success' 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : mlStatus === 'error'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {isTestingML ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                      {mlStatus === 'success' ? 'ML Online' : mlStatus === 'error' ? 'Erro ML (403)' : 'Testar ML'}
                    </button>
                    <button
                      onClick={testSerperConnection}
                      disabled={isTestingML}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        serperStatus === 'success' 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : serperStatus === 'error'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {isTestingML ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                      {serperStatus === 'success' ? 'Serper Online' : serperStatus === 'error' ? 'Erro Serper' : 'Testar Serper'}
                    </button>
                    {mlStatus === 'error' && (
                      <button 
                        onClick={() => setShowTokenHelp(true)}
                        className="text-[10px] text-blue-600 underline font-bold"
                      >
                        Como resolver?
                      </button>
                    )}
                    <button
                      onClick={handleClear}
                      className="flex-1 sm:flex-none px-6 py-3.5 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 size={18} />
                      Limpar
                    </button>
                    <button
                      onClick={handleSearch}
                      disabled={!query.trim()}
                      className="md:hidden flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white px-10 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-blue-600/20 active:scale-95"
                    >
                      <Search size={20} />
                      Buscar Ofertas
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { icon: <Zap className="text-amber-500" />, title: "Velocidade Real", desc: "Reduza horas de pesquisa manual para meros segundos." },
                  { icon: <TrendingUp className="text-emerald-500" />, title: "Economia Direta", desc: "Identificamos as variações de preço mais agressivas do mercado." },
                  { icon: <CheckCircle2 className="text-blue-500" />, title: "Precisão Técnica", desc: "Nossa IA entendecódigos, medidas e especificações industriais." }
                ].map((feature, i) => (
                  <div key={i} className="p-6 bg-white/50 rounded-2xl border border-white shadow-sm hover:shadow-md transition-all">
                    <div className="mb-3">{feature.icon}</div>
                    <h3 className="font-bold text-gray-800 mb-1">{feature.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : step === 'processing' ? (
            <motion.div
              key="processing-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-32 space-y-10"
            >
              <div className="relative">
                <div className="w-32 h-32 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    <Package className="w-10 h-10 text-blue-600" />
                  </motion.div>
                </div>
              </div>
              
              <div className="text-center space-y-4 max-w-md">
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Processamento Premium</h3>
                <div className="space-y-2">
                  {processingMessages.map((msg, i) => (
                    <motion.p
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ 
                        opacity: i === processingStep ? 1 : i < processingStep ? 0.4 : 0,
                        y: i === processingStep ? 0 : i < processingStep ? -5 : 10
                      }}
                      className={`text-lg font-medium ${i === processingStep ? 'text-blue-600' : 'text-gray-400'}`}
                    >
                      {msg}
                    </motion.p>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : step === 'report' ? (
            <ReportPage />
          ) : (
            <motion.div
              key="results-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* Results Header */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight">Resumo do Orçamento</h2>
                  <p className="text-gray-500 font-medium">
                    {results?.summary.totalItems} itens identificados • {results?.summary.analysisStatus === 'complete' ? 'Análise completa' : 'Revisão necessária'}
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex bg-gray-100 p-1 rounded-xl">
                    {[
                      { id: 'by-item', label: 'Por Item', icon: <Package size={14} /> },
                      { id: 'by-seller', label: 'Por Vendedor', icon: <Store size={14} /> },
                      { id: 'best-value', label: 'Custo-Benefício', icon: <TrendingUp size={14} /> }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setShowCart(true)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                          viewMode === mode.id 
                            ? 'bg-white text-blue-600 shadow-sm' 
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {mode.icon}
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Results List */}
              <div className="space-y-10">
                {results?.items.map((item) => (
                  <div key={item.id} className="space-y-4">
                    <div className="flex items-start justify-between px-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-black text-gray-900 tracking-tight">{item.normalizedName}</h3>
                          {item.quantity && (
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">
                              {item.quantity}x
                            </span>
                          )}
                          {item.status !== 'ok' && (
                            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                              <AlertCircle size={10} /> {item.status === 'ambiguous' ? 'Ambíguo' : 'Incompleto'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 font-medium italic">Original: "{item.originalText}"</p>
                        <p className="text-sm text-gray-500 font-medium">{item.specifications}</p>
                      </div>

                      <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
                        <button 
                          onClick={() => setLayoutMode('list')}
                          className={`p-2 rounded-lg transition-all ${layoutMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                          title="Visualizar em lista"
                        >
                          <List size={18} />
                        </button>
                        <button 
                          onClick={() => setLayoutMode('grid')}
                          className={`p-2 rounded-lg transition-all ${layoutMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                          title="Visualizar em grade"
                        >
                          <LayoutGrid size={18} />
                        </button>
                      </div>
                    </div>

                    <div className={layoutMode === 'grid' ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "space-y-3"}>
                      {item.offers.length > 0 ? (
                        item.offers.map((offer) => (
                          <div key={offer.id}>
                            <OfferCard 
                              offer={offer} 
                              layoutMode={layoutMode}
                              isSelected={selectedOffers[item.id]?.includes(offer.id) || false}
                              onSelect={() => toggleOfferSelection(item.id, offer.id)}
                            />
                          </div>
                        ))
                      ) : (
                        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl p-8 text-center">
                          <Package className="mx-auto text-gray-300 mb-3 w-10 h-10" />
                          <p className="text-gray-500 font-bold">
                            {item.status === 'forbidden' ? 'Erro de Acesso (403)' : 'Nenhuma oferta encontrada no Mercado Livre'}
                          </p>
                          <p className="text-gray-400 text-xs mt-1">
                            {item.status === 'forbidden' ? 'O Mercado Livre exige um Access Token. Adicione ML_ACCESS_TOKEN nos Secrets.' : 'Tente ajustar o nome do produto para ser mais genérico.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Cart Summary for Mobile */}
      {step === 'results' && totalSelectedPrice > 0 && (
        <motion.div 
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-6 left-6 right-6 md:hidden bg-gray-900 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between z-40"
        >
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase">Selecionado</p>
            <p className="text-lg font-bold">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSelectedPrice)}
            </p>
          </div>
          <button 
            onClick={() => setShowCart(true)}
            className="bg-blue-600 px-6 py-2 rounded-xl font-bold text-sm"
          >
            Ver Relatório
          </button>
        </motion.div>
      )}

      {/* Modal de Ajuda do Token */}
      <AnimatePresence>
        {showTokenHelp && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
              onClick={() => setShowTokenHelp(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl space-y-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                    <ShieldCheck size={24} />
                  </div>
                  <h3 className="text-xl font-black text-gray-900">Erro 403: Acesso Negado</h3>
                </div>
                <button onClick={() => setShowTokenHelp(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} className="text-gray-400" />
                </button>
              </div>

              <div className="space-y-4 text-gray-600 leading-relaxed">
                <p>O Mercado Livre bloqueou a busca anônima. Para resolver, você precisa de um <b>Access Token</b> temporário:</p>
                
                <ol className="space-y-3 list-decimal list-inside text-sm">
                  <li>Acesse o <a href="https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao" target="_blank" className="text-blue-600 underline font-bold">Portal de Desenvolvedores ML</a>.</li>
                  <li>Crie uma aplicação (ou use uma existente).</li>
                  <li>Gere um <b>Access Token</b> de teste.</li>
                  <li>No menu lateral deste editor, clique no ícone de cadeado (<b>Secrets</b>).</li>
                  <li>Adicione a variável <b>ML_ACCESS_TOKEN</b> com o seu token.</li>
                </ol>

                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-xs text-amber-800 flex gap-3">
                  <Info size={16} className="shrink-0" />
                  <p>Tokens de teste costumam durar 6 horas. Se a busca parar de funcionar, gere um novo token.</p>
                </div>
              </div>

              <button 
                onClick={() => setShowTokenHelp(false)}
                className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold hover:bg-black transition-all"
              >
                Entendi, vou configurar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

function getStoreLogo(site: string) {
  const s = site.toLowerCase();
  if (s.includes('mercadolivre')) return 'https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/5.21.22/mercadolivre/logo__large_plus.png';
  if (s.includes('amazon')) return 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg';
  if (s.includes('magazineluiza') || s.includes('magalu')) return 'https://upload.wikimedia.org/wikipedia/commons/a/a3/Logo_Magalu.png';
  if (s.includes('shopee')) return 'https://upload.wikimedia.org/wikipedia/commons/f/fe/Shopee.svg';
  if (s.includes('americanas')) return 'https://upload.wikimedia.org/wikipedia/commons/2/23/Logo_Americanas.png';
  if (s.includes('buscape')) return 'https://www.buscape.com.br/favicon.ico';
  if (s.includes('zoom')) return 'https://www.zoom.com.br/favicon.ico';
  return null;
}

function OfferCard({ offer, isSelected, onSelect, layoutMode = 'grid' }: { offer: Offer, isSelected: boolean, onSelect: () => void, layoutMode?: 'grid' | 'list' }) {
  const storeLogo = getStoreLogo(offer.site);

  if (layoutMode === 'list') {
    return (
      <motion.div
        whileHover={{ x: 4 }}
        className={`bg-white p-3 rounded-2xl border-2 transition-all flex items-center gap-4 relative overflow-hidden ${
          isSelected ? 'border-blue-600 bg-blue-50/30' : 'border-transparent shadow-sm hover:shadow-md'
        }`}
      >
        <div className="w-12 h-12 bg-gray-50 rounded-xl overflow-hidden shrink-0 border border-gray-100 p-1">
          <img 
            src={offer.imageUrl} 
            alt={offer.productName}
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-1 rounded uppercase tracking-tighter">
              {Math.round(offer.confidence * 100)}% Match
            </span>
            <div className="flex items-center gap-1">
              {storeLogo && <img src={storeLogo} alt={offer.site} className="h-3 w-auto object-contain grayscale opacity-70" referrerPolicy="no-referrer" />}
              <span className="text-[9px] font-bold text-gray-400 uppercase truncate">{offer.site}</span>
            </div>
          </div>
          <h4 className="font-bold text-gray-900 text-sm leading-tight truncate">{offer.productName}</h4>
          {offer.link && offer.link !== '#' && (
            <p className="text-[8px] text-gray-400 truncate mt-0.5 opacity-60 hover:opacity-100 transition-opacity">
              {offer.link}
            </p>
          )}
        </div>

        <div className="flex items-center gap-6 shrink-0">
          <div className="text-right">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Preço</p>
            <p className="text-sm font-black text-gray-900">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(offer.price)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a 
              href={offer.link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-2 text-gray-400 hover:text-blue-600 transition-all hover:scale-110 active:scale-90"
              onClick={(e) => {
                e.stopPropagation();
                if (!offer.link || offer.link === '#') {
                  e.preventDefault();
                  alert('Link não disponível para esta oferta estimada.');
                } else {
                  // Força abertura em nova aba caso o target="_blank" falhe no iframe
                  window.open(offer.link, '_blank', 'noopener,noreferrer');
                  e.preventDefault();
                }
              }}
            >
              <ExternalLink size={16} />
            </a>
            <button 
              onClick={onSelect}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                isSelected 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {isSelected ? <CheckCircle2 size={14} /> : <ShoppingCart size={14} />}
              {isSelected ? 'Selecionado' : 'Selecionar'}
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className={`bg-white p-5 rounded-3xl border-2 transition-all flex gap-5 group relative overflow-hidden ${
        isSelected ? 'border-blue-600 shadow-xl shadow-blue-600/10' : 'border-transparent shadow-sm hover:shadow-md'
      }`}
    >
      {offer.isBestPrice && (
        <div className="absolute top-0 right-0 bg-emerald-500 text-white px-3 py-1 rounded-bl-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
          <TrendingUp size={10} /> Melhor Preço
        </div>
      )}
      {offer.isFastest && !offer.isBestPrice && (
        <div className="absolute top-0 right-0 bg-blue-500 text-white px-3 py-1 rounded-bl-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
          <Zap size={10} /> Mais Rápido
        </div>
      )}

      <div className="w-28 h-28 bg-gray-50 rounded-2xl overflow-hidden shrink-0 border border-gray-100 p-2">
        <img 
          src={offer.imageUrl} 
          alt={offer.productName}
          className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500"
          referrerPolicy="no-referrer"
        />
      </div>
      
      <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-tighter">
              {Math.round(offer.confidence * 100)}% Match
            </span>
            <div className="flex items-center gap-1">
              {storeLogo && <img src={storeLogo} alt={offer.site} className="h-3 w-auto object-contain grayscale opacity-70" referrerPolicy="no-referrer" />}
              <span className="text-[10px] font-bold text-gray-400 uppercase truncate">{offer.site}</span>
            </div>
          </div>
          <h4 className="font-bold text-gray-900 leading-tight line-clamp-2 group-hover:text-blue-600 transition-colors">{offer.productName}</h4>
          
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1 text-xs text-gray-500 font-medium">
              <Clock size={12} className="text-gray-400" />
              <span>{offer.deliveryDays} dias</span>
            </div>
            {offer.freeShipping && (
              <div className="flex items-center gap-1 text-xs text-emerald-600 font-bold">
                <Truck size={12} />
                <span>Grátis</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-gray-500 font-medium">
              <Store size={12} className="text-gray-400" />
              <span className="truncate max-w-[100px]">{offer.seller}</span>
            </div>
          </div>
          {offer.soldQuantity !== undefined && offer.soldQuantity > 0 && (
            <p className="text-[10px] text-gray-400 mt-1 font-medium">
              {offer.soldQuantity}+ vendidos • {offer.condition}
            </p>
          )}
        </div>

        <div className="flex items-end justify-between mt-2">
          <div className="flex flex-col flex-1 min-w-0 mr-4">
            <span className="text-xs text-gray-400 font-bold uppercase tracking-tighter">Preço Unitário</span>
            <span className="text-xl font-black text-gray-900">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(offer.price)}
            </span>
            {offer.link && offer.link !== '#' && (
              <p className="text-[9px] text-gray-400 truncate mt-1 opacity-60 hover:opacity-100 transition-opacity max-w-[200px]">
                {offer.link}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <a 
              href={offer.link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-2 text-gray-400 hover:text-blue-600 transition-all hover:scale-110 active:scale-90"
              onClick={(e) => {
                e.stopPropagation();
                if (!offer.link || offer.link === '#') {
                  e.preventDefault();
                  alert('Link não disponível para esta oferta estimada.');
                } else {
                  // Força abertura em nova aba caso o target="_blank" falhe no iframe
                  window.open(offer.link, '_blank', 'noopener,noreferrer');
                  e.preventDefault();
                }
              }}
            >
              <ExternalLink size={18} />
            </a>
            <button 
              onClick={onSelect}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                isSelected 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {isSelected ? <CheckCircle2 size={16} /> : <ShoppingCart size={16} />}
              {isSelected ? 'Selecionado' : 'Selecionar'}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
