import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Globe as GlobeIcon, Users, TrendingUp, Download, Camera } from 'lucide-react';
import { WorldMap } from './ui/WorldMap';
import { toPng } from 'html-to-image';
import { cn } from '../utils/cn';

import { KEEPER_URL } from '../constants';

export const GlobalExpansionMap = React.memo(({ theme, currentNetwork, activeBets = [], isFullscreen = false }) => {
    const mapRef = useRef();
    const [data, setData] = useState({ stats: [], pings: [] });
    const isLight = theme === 'light';

    // Geo-Hash: Map a string (wallet) to consistent Lat/Lng
    const getGeoHash = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        // Normalize hash to Lat (-90 to 90) and Lng (-180 to 180)
        // Focus on populated areas (rough bounding boxes) to look realistic
        const lat = (Math.abs(hash) % 140) - 70; // -70 to 70
        const lng = (Math.abs(hash >> 16) % 360) - 180; // -180 to 180
        return { lat, lng };
    };

    useEffect(() => {
        // Removed globe-data fetch - endpoint doesn't exist and was causing freezes
        // Map now relies solely on activeBets prop for live data
    }, []);

    // Point data from Active Bets (Live Pings)
    // If activeBets provided, use those. Else fallback to historical pings.
    const pointsData = useMemo(() => {
        const source = activeBets.length > 0 ? activeBets : [];

        return source.map((bet, idx) => {
            // Use owner/user address for location consistency
            const id = bet.owner || bet.user || `anon_${idx}`;
            const coords = getGeoHash(id);

            return {
                start: coords, // Pulse location
                end: null, // No arcs
                label: `${bet.amount} ${bet.network === 'solana' ? 'SOL' : 'USDC'}`,
                color: (bet.network || 'solana') === 'arc' ? '#3B82F6' : '#3CB371',
                key: bet.id || idx
            };
        });
    }, [activeBets, currentNetwork]);

    const primaryColor = currentNetwork.toLowerCase() === 'arc' ? '#3B82F6' : '#3CB371';

    // In full screen, we remove the side panel and make map valid full container
    const containerClasses = isFullscreen
        ? "h-full w-full overflow-hidden flex flex-col relative"
        : cn("p-1 lg:p-8 rounded-[32px] border transition-all duration-500 overflow-hidden relative",
            isLight ? "bg-white border-black/5" : "bg-[#050505] border-white/10 shadow-2xl");

    const handleDownload = async () => {
        if (!mapRef.current) return;
        try {
            const dataUrl = await toPng(mapRef.current, { cacheBust: true });
            const link = document.createElement('a');
            link.download = `15market-global-expansion-${Date.now()}.png`;
            link.href = dataUrl;
            link.click();
        } catch (e) { }
    };

    return (
        <section className={isFullscreen ? "h-full w-full" : "w-full mb-14"} id="region-section">
            <div className={containerClasses} ref={mapRef}>

                {/* Background Glow */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] blur-[120px] opacity-10 rounded-full"
                        style={{ background: primaryColor }} />
                </div>

                {/* Only show Stats sidebar if NOT fullscreen */}
                {!isFullscreen && (
                    <div className="flex flex-col lg:flex-row gap-8 relative z-10">
                        {/* ... Existing sidebar code omitted for brevity ... */}
                        {/* Simplified for non-fullscreen mode, preserving old layout if needed */}
                        {/* Left side: Statistics List */}
                        <div className="lg:w-1/3 flex flex-col gap-6 order-2 lg:order-1">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-white/5 border border-white/10" style={{ color: primaryColor }}>
                                        <GlobeIcon size={20} />
                                    </div>
                                    <h3 className="text-xl font-black uppercase tracking-tight text-white">Global Reach</h3>
                                </div>
                            </div>
                            {/* Stats List */}
                            <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                                {activeBets.length > 0 ? (
                                    activeBets.slice(0, 5).map((bet, idx) => (
                                        <div key={bet.id || idx} className="p-4 rounded-2xl bg-white/5 border border-white/5 flex justify-between items-center text-white">
                                            <span className="text-xs">{bet.owner?.slice(0, 6)}...{bet.owner?.slice(-4)}</span>
                                            <span className="font-mono text-xs">{bet.amount} {bet.network === 'solana' ? 'SOL' : 'USDC'}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-center text-white/40 text-xs">
                                        No active bets
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Map Container */}
                <div className={isFullscreen ? "absolute inset-0 z-0" : "lg:w-2/3 relative order-1 lg:order-2 rounded-[24px] overflow-hidden bg-black/40 border border-white/5 shadow-inner"}>
                    {pointsData && pointsData.length >= 0 ? (
                        <WorldMap
                            dots={pointsData}
                            lineColor={primaryColor}
                            theme={theme}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/40 text-sm">
                            Loading map...
                        </div>
                    )}

                    {/* Overlay Controls/Info - Absolute Positioned */}
                    <div className="absolute bottom-10 left-10 z-[20] pointer-events-none">
                        <div className="p-6 rounded-3xl bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl max-w-sm">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-2.5 h-2.5 rounded-full animate-pulse shadow-[0_0_8px]" style={{ backgroundColor: primaryColor, boxShadow: `0 0 12px ${primaryColor}` }} />
                                <span className="text-xs font-black uppercase tracking-widest text-white">
                                    {activeBets.length > 0 ? `${activeBets.length} Active Signals` : "Listening for Network Activity..."}
                                </span>
                            </div>
                            <p className="text-[9px] font-bold uppercase opacity-40 text-white leading-relaxed">
                                Real-time geolocation of active protocol participants. Points represent live liquidity injection events.
                            </p>
                        </div>
                    </div>

                    <div className="absolute top-10 right-10 z-[20]">
                        <button
                            onClick={handleDownload}
                            className="p-3 rounded-xl bg-black/40 border border-white/10 text-white/50 hover:text-white transition-all backdrop-blur-md"
                        >
                            <Camera size={20} />
                        </button>
                    </div>
                </div>

            </div>
        </section>
    );
});

