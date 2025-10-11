export type SiteMapEntry = {
  title: string;
  url: string;
  summary: string;
};

export const SITE_MAP: SiteMapEntry[] = [
  {
    title: 'Library Hours (LibCal)',
    url: 'https://gc-cuny.libcal.com/hours?cid=15537',
    summary: 'Official hours for Mina Rees Library including today and upcoming changes.'
  },
  {
    title: 'Ask a Librarian',
    url: 'https://libguides.gc.cuny.edu/ask-a-librarian',
    summary: 'Live chat, email, and consultation request options for getting help from librarians.'
  },
  {
    title: 'Contact Us',
    url: 'https://libguides.gc.cuny.edu/contact_us',
    summary: 'Contact information for service desks, departments, and phone numbers (part of Ask a Librarian guide).'
  },
  {
    title: 'Library Directory (A-Z Staff)',
    url: 'https://libguides.gc.cuny.edu/directory',
    summary: 'Find library staff by name and title (alphabetical listing).'
  },
  {
    title: 'Accounts & Logins',
    url: 'https://libguides.gc.cuny.edu/cuny_accounts',
    summary: 'Guidance on GC credentials, OneSearch accounts, ILLiad access, and remote authentication.'
  },
  {
    title: 'About the Library',
    url: 'https://libguides.gc.cuny.edu/about_the_library',
    summary: 'Overview of Mina Rees Library services, mission, and quick facts.'
  },
  {
    title: 'Visit the Library',
    url: 'https://libguides.gc.cuny.edu/visit',
    summary: 'Location, directions, visitor policies, and entry requirements.'
  },
  {
    title: 'Accessibility Resources',
    url: 'https://libguides.gc.cuny.edu/accessibility',
    summary: 'Accessibility services, assistive technologies, and accommodation contacts.'
  },
  {
    title: 'Borrowing & Access Policies',
    url: 'https://libguides.gc.cuny.edu/access',
    summary: 'Loan periods, borrowing eligibility, alumni access, and material request policies.'
  },
  {
    title: 'Course Reserves',
    url: 'https://libguides.gc.cuny.edu/reserves',
    summary: 'Information for students and faculty about course reserve materials and procedures.'
  },
  {
    title: 'Instruction & Workshops',
    url: 'https://libguides.gc.cuny.edu/instruction-and-workshops',
    summary: 'Request library instruction, explore workshops, and connect with teaching librarians.'
  },
  {
    title: 'Events Calendar',
    url: 'https://gc-cuny.libcal.com/rss.php?m=2month&cid=15537',
    summary: 'Upcoming library events, workshops, and consultations from the LibCal RSS feed (use this for up-to-date listings).'
  },
  {
    title: 'Library Collections Overview',
    url: 'https://libguides.gc.cuny.edu/library_collections',
    summary: 'Highlights of collections, subject strengths, and special collections information.'
  },
  {
    title: 'Subject Liaisons Directory',
    url: 'https://libguides.gc.cuny.edu/directory/subject',
    summary: 'Find librarians by subject area and specialty - contact details and areas of expertise.'
  },
  {
    title: 'Databases A-Z',
    url: 'https://libguides.gc.cuny.edu/az/databases',
    summary: 'Alphabetical and subject filtering for licensed databases and discovery tools.'
  },
  {
    title: 'Journals A-Z',
    url: 'https://libguides.gc.cuny.edu/JournalsAZ',
    summary: 'Searchable list of journals and serials available online or in print.'
  },
  {
    title: 'LibGuides Home',
    url: 'https://libguides.gc.cuny.edu/',
    summary: 'Subject, course, and resource guides curated by Mina Rees librarians.'
  },
  {
    title: 'Citation Support',
    url: 'https://libguides.gc.cuny.edu/citation',
    summary: 'Style guides and tools for citing sources in APA, MLA, Chicago, and more.'
  },
  {
    title: 'Data Management',
    url: 'https://libguides.gc.cuny.edu/datamgmt',
    summary: 'Guidance on data management plans, storage, and preservation best practices.'
  },
  {
    title: 'Dissertations & Theses',
    url: 'https://libguides.gc.cuny.edu/dissertations',
    summary: 'Depositing Graduate Center dissertations and theses, plus finding and searching dissertations.'
  },
  {
    title: 'Scholarly Services',
    url: 'https://libguides.gc.cuny.edu/scholarship',
    summary: 'Support for publishing, open access, impact metrics, and sharing scholarship.'
  },
  {
    title: 'Share Your Work',
    url: 'https://libguides.gc.cuny.edu/share',
    summary: 'Information on depositing in CUNY Academic Works and other sharing platforms.'
  },
  {
    title: 'Library News & Blog',
    url: 'https://gclibrary.commons.gc.cuny.edu/',
    summary: 'Library announcements, highlights, and featured content from Mina Rees Library.'
  },
  {
    title: 'Technology in the Library – Software Availability',
    url: 'https://libguides.gc.cuny.edu/librarytech/software',
    summary: 'Lists software (including NVivo, SPSS, and other research tools) installed on library computers and how to request remote access.'
  },
  {
    title: 'Graduate Center IT Services',
    url: 'https://www.gc.cuny.edu/it',
    summary: 'Central Graduate Center IT support, including help desk, software access, remote desktop, and classroom technology.'
  },
  {
    title: 'Support the Library',
    url: 'https://libguides.gc.cuny.edu/support-the-library',
    summary: 'Friends of the Library, giving opportunities, and ways to donate.'
  },
  {
    title: 'Graduate Center Homepage',
    url: 'https://www.gc.cuny.edu/',
    summary: 'Main Graduate Center site with institutional news, academic programs, and student services—reference when broader GC context is needed.'
  }
];

export function formatSiteMapForPrompt(entries: SiteMapEntry[] = SITE_MAP): string {
  const header = 'Key Mina Rees Library entry points (not exhaustive—explore beyond this list as needed):';
  const bullets = entries
    .map((entry) => `- ${entry.title}: ${entry.url}\n  ${entry.summary}`)
    .join('\n');
  return `${header}\n${bullets}`;
}
