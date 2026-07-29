/* eslint-disable @typescript-eslint/no-require-imports */
const {PrismaClient} = require('./node_modules/@prisma/client');
const p = new PrismaClient();

async function main() {
  const [waitlist, users, orgs, workspaces, projects, tasks, docs, okrs] = await Promise.all([
    p.waitlistEntry.findMany({ orderBy: { position: 'asc' } }),
    p.user.count(),
    p.organization.count(),
    p.workspace.count(),
    p.project.count(),
    p.task.count(),
    p.document.count(),
    p.oKR.count(),
  ]);

  console.log('=== DATABASE SUMMARY ===');
  console.log('WaitlistEntry : ' + waitlist.length);
  console.log('User          : ' + users);
  console.log('Organization  : ' + orgs);
  console.log('Workspace     : ' + workspaces);
  console.log('Project       : ' + projects);
  console.log('Task          : ' + tasks);
  console.log('Document      : ' + docs);
  console.log('OKR           : ' + okrs);

  if (waitlist.length > 0) {
    console.log('\n=== WAITLIST ENTRIES ===');
    waitlist.forEach(function(e) {
      console.log(
        '  #' + e.position + ' | ' + e.fullName + ' <' + e.email + '>' +
        ' | status=' + e.status +
        ' | refs=' + e.referralCount +
        ' | role=' + e.role +
        ' | company=' + (e.company || '-')
      );
    });
  } else {
    console.log('\nNo waitlist entries yet.');
  }
}

main().catch(console.error).finally(function() { p['$disconnect'](); });
