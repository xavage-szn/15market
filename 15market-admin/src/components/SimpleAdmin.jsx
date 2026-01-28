import React from 'react';

const SimpleAdmin = () => {
    return (
        <div style={{ padding: '40px', background: '#0f172a', color: 'white', minHeight: '100vh', fontFamily: 'sans-serif' }}>
            <h1 style={{ fontSize: '32px', marginBottom: '20px', color: '#38bdf8' }}>Admin Portal - Diagnostic Mode</h1>
            <div style={{ padding: '20px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)' }}>
                <p style={{ fontSize: '18px', marginBottom: '10px' }}>✅ Application Shell is Running</p>
                <p>If you see this screen, the React mount is successful.</p>
                <hr style={{ margin: '20px 0', borderColor: 'rgba(255,255,255,0.1)' }} />
                <p>The main <code>AdminPortal</code> component failed to load, likely due to:</p>
                <ul style={{ listStyle: 'disc', marginLeft: '24px', marginTop: '10px', color: '#94a3b8' }}>
                    <li>A top-level import error</li>
                    <li>A variable initialization error (TDZ)</li>
                    <li>Missing dependency</li>
                </ul>
            </div>
        </div>
    );
};

export default SimpleAdmin;
