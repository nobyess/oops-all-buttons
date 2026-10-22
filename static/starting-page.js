export function startingPage(pages,user){
 return pages.find(page=>page.id===user?.starting_page) || pages.find(page=>page.starterPage || page.name==='Start Page') || pages[0];
}
