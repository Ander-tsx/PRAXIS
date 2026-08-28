const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/components/organisms/AccountIdentity/AccountIdentity.tsx';
let code = fs.readFileSync(path, 'utf8');

// Currently:
// <section className="w-full max-w-4xl mx-auto rounded-none sm:rounded-2xl border-x sm:border border-white/5 bg-[#080807] text-white overflow-hidden pb-6">

const oldSection = '<section className="w-full max-w-4xl mx-auto rounded-none sm:rounded-2xl border-x sm:border border-white/5 bg-[#080807] text-white overflow-hidden pb-6">';
// We will use negative margins to negate AppHeader padding (p-4 sm:p-6).
// And make it min-h-screen to cover the bottom space too!
const newSection = '<section className="w-full -mt-4 sm:-mt-6 -mx-4 sm:-mx-6 !w-[calc(100%+32px)] sm:!w-[calc(100%+48px)] bg-[#080807] text-white pb-12 min-h-screen">';

code = code.replace(oldSection, newSection);

// Also let's make the max-width inner content constrained if we want, or completely edge-to-edge. 
// "usa el 100% del area disponible". The cover should take 100% of the screen width.
const oldCover = '<div className="h-40 sm:h-56 w-full bg-[#161615] relative">';
const newCover = '<div className="h-48 sm:h-72 w-full bg-[#161615] relative">';
code = code.replace(oldCover, newCover);

const oldContentWrapper = '<div className="px-4 sm:px-6">';
const newContentWrapper = '<div className="px-6 sm:px-12 max-w-screen-2xl mx-auto">';
code = code.replace(oldContentWrapper, newContentWrapper);

fs.writeFileSync(path, code);
