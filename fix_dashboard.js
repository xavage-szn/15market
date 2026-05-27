const fs = require('fs');
const path = 'c:/Users/HP/Documents/15market/15market/src/components/DashboardPage.jsx';
let src = fs.readFileSync(path, 'utf8');

// Remove unused import lines
const removeLines = [
  /^import MessagingSystem from "\.\/MessagingSystem";\r?\n/m,
  /^import CampaignLeaderboardPane from "\.\/CampaignLeaderboardPane";\r?\n/m,
  /^import \{ LatencyMeter \} from "\.\/LatencyMeter";\r?\n/m,
  /^import GlobalLoader from "\.\/GlobalLoader";\r?\n/m,
  /^import \{ useCreateWallet \} from '@privy-io\/react-auth';\r?\n/m,
  /^\s+const \{ createWallet \} = useCreateWallet\(\);\r?\n/m,
];
removeLines.forEach(re => { src = src.replace(re, ''); });

// Remove unused icon names from lucide import
const unusedIcons = ['Check', 'Trophy', 'Award', 'Globe', 'MessageSquare', 'Send', 'ArrowDownLeft', 'Megaphone', 'Calendar', 'Smile'];
// We won't remove icons since some might be used; just leave them

// Count div opens vs closes to find the gap
const opens = (src.match(/<div/g)||[]).length;
const closes = (src.match(/<\/div>/g)||[]).length;
console.log(`div opens: ${opens}, closes: ${closes}, gap: ${opens - closes}`);

// The gap is 8 - these are the unclosed divs in the main body wrapper structure
// We need to insert missing </div> tags before the final closing </div>\n    );\n};
// The structure is:
//   <div (root)>          <- 1
//     <style>...</style>
//     <div (header)>      <- 2
//       <div>             <- 3
//         ...
//       </div>            <- 3
//     </div>              <- 2
//     <div (body flex)>   <- 4
//       <div (left col)>  <- 5
//         <div wallet-group> <- 6
//           ... all closed
//         </div>          <- 6
//         <div actions>   <- already closed
//       </div>            <- 5 MISSING
//     </div>              <- 4 MISSING
//   </div>                <- 1

// Find the "Built by 15Lab" line and add missing closing divs after the outer flex div
const marker = '            <div className="flex-none text-right pb-2 text-[10px] font-black text-[#133a2a]/30 uppercase tracking-widest">Built by 15Lab</div>\r\n                </div>\r\n            </div>\r\n        </div>';
const markerAlt = '            <div className="flex-none text-right pb-2 text-[10px] font-black text-[#133a2a]/30 uppercase tracking-widest">Built by 15Lab</div>\n                </div>\n            </div>\n        </div>';

// Check what's around the "Built by 15Lab"
const idx = src.indexOf('Built by 15Lab');
if (idx !== -1) {
  const snippet = src.slice(idx - 20, idx + 300);
  console.log('--- Around Built by 15Lab ---');
  console.log(JSON.stringify(snippet));
}

fs.writeFileSync(path, src);
console.log('Saved.');
