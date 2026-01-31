import { useEffect, useRef, memo } from 'react';

const MoralisWidget = memo(({ pairAddress, network, theme }) => {
    const containerId = `price-chart-widget-container-${pairAddress}`;
    const widgetRef = useRef(null);

    useEffect(() => {
        let active = true;

        const initWidget = () => {
            if (typeof window.createMyWidget === 'function' && active) {
                try {
                    const container = document.getElementById(containerId);
                    if (container) container.innerHTML = '';

                    window.createMyWidget(containerId, {
                        autoSize: true,
                        chainId: network === 'arc' ? '0x1' : 'solana', // Fallback to ETH if not solana
                        pairAddress: pairAddress || 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
                        showHoldersChart: false,
                        defaultInterval: '1m',
                        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC',
                        theme: theme === 'light' ? 'light' : 'moralis',
                        locale: 'en',
                        backgroundColor: theme === 'light' ? '#ffffff' : '#050505',
                        gridColor: theme === 'light' ? '#f0f0f0' : '#111111',
                        candleUpColor: network === 'arc' ? '#3B82F6' : '#3CB371',
                        candleDownColor: '#FF4444',
                        textColor: theme === 'light' ? '#000000' : '#ffffff',
                        hideLeftToolbar: false,
                        hideTopToolbar: false,
                        hideBottomToolbar: false
                    });
                } catch (e) {
                    console.error('Moralis init error:', e);
                }
            } else if (active) {
                // Retry if script not yet loaded
                setTimeout(initWidget, 500);
            }
        };

        initWidget();
        return () => { active = false; };
    }, [pairAddress, network, theme, containerId]);

    return <div id={containerId} style={{ width: '100%', height: '100%' }} />;
});

export default function MoralisChart({ pairAddress, network, theme }) {
    return (
        <div className="w-full h-full relative overflow-hidden rounded-[24px] lg:rounded-[32px] bg-black shadow-[0_0_50px_rgba(60,179,113,0.1)]">
            <MoralisWidget pairAddress={pairAddress} network={network} theme={theme} />
            {/* Subtle Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-[0.03]">
                <img src="/logo.png" alt="15market" className="w-[40%] grayscale" />
            </div>
        </div>
    );
}
