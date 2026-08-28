const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/app/(private)/organizations/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// Replace the solid white button with a standard outline or white/10 button
code = code.replace(
  `className="shrink-0 inline-flex items-center justify-center bg-white text-black font-bold py-3 px-6 rounded-xl hover:bg-white/90 transition-all shadow-lg"`,
  `className="shrink-0 inline-flex items-center justify-center border border-white/20 bg-transparent text-white font-bold py-2.5 px-5 rounded-full hover:bg-white/5 transition-colors"`
);

// Remove the blur-3xl gradient completely
code = code.replace(
  /<div className="absolute top-0 right-0 w-32 h-32 bg-white\/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-primary\/20 transition-colors duration-500" \/>/g,
  ''
);

// Make the cards truly black bg-[#080807] instead of #0F0F0F, or just transparent
code = code.replace(
  `className="group relative flex flex-col justify-between rounded-3xl p-6 sm:p-8 bg-[#0F0F0F] border border-white/5 hover:border-white/20 transition-all hover:-translate-y-1 shadow-xl overflow-hidden"`,
  `className="group relative flex flex-col justify-between rounded-2xl p-6 sm:p-8 bg-[#080807] border border-white/10 hover:border-white/30 transition-colors overflow-hidden"`
);

// Fix the QueDaUnaOrganizacion features
code = code.replace(
  `bg-[#0F0F0F] border border-white/5 relative overflow-hidden group hover:border-white/20 transition-all"`,
  `bg-[#080807] border border-white/10 relative overflow-hidden group hover:border-white/20 transition-colors"`
);

// Remove the hover:scale-110 and group-hover:bg-primary/20
code = code.replace(
  `group-hover:scale-110 group-hover:bg-primary/20 group-hover:text-primary transition-all duration-300`,
  `group-hover:text-white transition-colors`
);

// Change shadows if any left
// Make AppHeader actually use full width but content is centered. 

fs.writeFileSync(path, code);
