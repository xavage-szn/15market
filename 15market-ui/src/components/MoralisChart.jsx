import React, { useEffect, useRef, memo } from 'react';

/**
 * MoralisChart - A React wrapper for the Moralis Price Chart Widget.
 * This widget is loaded via an external script and initialized into a container.
 */
function MoralisWidget({ pairAddress, network, theme }) {
    const containerId = `price-chart-widget-container-${pairAddress}`;

    // Dynamic colors based on network and theme
    const candleUpColor = theme === 'light'
        ? (network === 'arc' ? '#2563eb' : '#059669') // Darker Blue / Darker Green
        : (network === 'arc' ? '#3B82F6' : '#3CB371'); // Original Arc Blue / Green
    const textColor = theme === 'light' ? '#1f2937' : (network === 'arc' ? '#3B82F6' : '#3CB371');
    const backgroundColor = theme === 'light' ? '#ffffff' : '#000000';
    const gridColor = theme === 'light' ? '#e5e7eb' : '#000000';

    useEffect(() => {
        const scriptId = 'moralis-chart-widget-script';

        const loadWidget = () => {
            if (typeof window.createMyWidget === 'function') {
                try {
                    // Clear previous content if any
                    const container = document.getElementById(containerId);
                    if (container) container.innerHTML = '';

                    window.createMyWidget(containerId, {
                        autoSize: true,
                        chainId: 'solana',
                        pairAddress: pairAddress || 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
                        showHoldersChart: false,
                        defaultInterval: '1D',
                        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Etc/UTC',
                        theme: 'moralis',
                        locale: 'en',
                        backgroundColor: backgroundColor,
                        gridColor: gridColor,
                        candleUpColor: candleUpColor,
                        candleDownColor: '#FF4444',
                        textColor: textColor,
                        hideLeftToolbar: true,
                        hideTopToolbar: false,
                        hideBottomToolbar: true
                    });
                } catch (error) {
                    console.error('Error initializing Moralis widget:', error);
                }
            }
        };

        if (!document.getElementById(scriptId)) {
            const script = document.createElement('script');
            script.id = scriptId;
            script.src = 'https://moralis.com/static/embed/chart.js';
            script.type = 'text/javascript';
            script.async = true;
            script.onload = loadWidget;
            document.body.appendChild(script);
        } else {
            loadWidget();
        }

        // Reload widget when network changes
        return () => {
            const container = document.getElementById(containerId);
            if (container) container.innerHTML = '';
        };
    }, [pairAddress, network, theme]);

    return (
        <div
            id={containerId}
            key={pairAddress}
            style={{ width: '100%', height: '100%' }}
        />
    );
}

const MemoizedMoralisWidget = memo(MoralisWidget);

export default function MoralisChart({ pairAddress, symbol, network, theme }) {
    return (
        <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", borderRadius: "32px", background: theme === 'light' ? '#ffffff' : '#000000' }}>
            <MemoizedMoralisWidget pairAddress={pairAddress} network={network} theme={theme} />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <img src="/logo.png" alt="15market" className="w-[30%] opacity-5 filter grayscale blur-[2px]" />
            </div>
        </div>
    );
}
