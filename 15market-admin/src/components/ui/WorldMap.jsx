import React, { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DottedMap from "dotted-map";
import { cn } from "../../utils/cn";

// Initialize the map grid ONCE at module level to prevent UI thread blocking on re-renders
const mapInstance = new DottedMap({ height: 100, grid: "diagonal" });

export const WorldMap = React.memo(function WorldMap({
    dots = [],
    lineColor = "#22c55e",
    theme = "dark"
}) {
    const svgRef = useRef(null);
    const isDark = theme === "dark";

    // Only regenerate the background SVG string if the theme (color) actually changes
    const svgMap = React.useMemo(() => {
        return mapInstance.getSVG({
            radius: 0.22,
            color: isDark ? "#FFFFFF40" : "#00000040",
            shape: "circle",
            backgroundColor: isDark ? "black" : "white",
        });
    }, [isDark]);

    const projectPoint = (lat, lng) => {
        const x = (lng + 180) * (800 / 360);
        const y = (90 - lat) * (400 / 180);
        return { x, y };
    };

    return (
        <div className={cn("w-full h-full relative font-sans", isDark ? "bg-black" : "bg-white")}>
            <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
                className="h-full w-full object-cover [mask-image:linear-gradient(to_bottom,transparent,white_10%,white_90%,transparent)] pointer-events-none select-none"
                alt="world map"
                draggable={false}
            />
            <svg
                ref={svgRef}
                viewBox="0 0 800 400"
                className="w-full h-full absolute inset-0 pointer-events-none select-none"
                preserveAspectRatio="xMidYMid slice"
            >
                <AnimatePresence>
                    {dots.map((dot, i) => {
                        const point = projectPoint(dot.start.lat, dot.start.lng);
                        return (
                            <motion.g
                                key={`point-${dot.key || i}`}
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                                transition={{ duration: 0.5 }}
                            >
                                <circle
                                    cx={point.x}
                                    cy={point.y}
                                    r="2"
                                    fill={dot.color || lineColor}
                                />
                                <circle
                                    cx={point.x}
                                    cy={point.y}
                                    r="2"
                                    fill={dot.color || lineColor}
                                    opacity="1"
                                >
                                    <animate attributeName="r" from="2" to="12" dur="1.5s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" from="1" to="0" dur="1.5s" repeatCount="indefinite" />
                                </circle>
                            </motion.g>
                        );
                    })}
                </AnimatePresence>
            </svg>
        </div>
    );
});
