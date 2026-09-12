import {PageHero,Shell} from "@/components/SiteShell";

export const metadata={title:"Our Certifications",description:"Learn about Mac2MacOnline's R2v3, ISO 9001, ISO 14001 and ISO 45001 certified operations and review official descriptions of each standard.",alternates:{canonical:"/certifications"}};

const standards=[
  {id:"iso-9001",number:"ISO 9001",label:"Quality",eyebrow:"QUALITY MANAGEMENT",description:"ISO 9001 defines requirements for a quality management system focused on consistent products and services, customer requirements, process control and continual improvement.",url:"https://www.iso.org/standard/62085.html"},
  {id:"iso-14001",number:"ISO 14001",label:"Environmental",eyebrow:"ENVIRONMENTAL MANAGEMENT",description:"ISO 14001 provides a framework for an environmental management system, including environmental impacts, legal obligations, operational controls and continual improvement.",url:"https://www.iso.org/standard/60857.html"},
  {id:"iso-45001",number:"ISO 45001",label:"Health & Safety",eyebrow:"OCCUPATIONAL HEALTH & SAFETY",description:"ISO 45001 sets requirements for an occupational health and safety management system designed to manage risks, improve workplace safety and support healthier working conditions.",url:"https://www.iso.org/standard/63787.html"},
];

export default function Certifications(){return <Shell>
  <PageHero eyebrow="CERTIFIED OPERATIONAL FOUNDATION" title="Our Certifications" intro="Sierra Circuit Repair, Inc., doing business as Mac2MacOnline, maintains certified systems supporting responsible electronics handling, quality, environmental management and workplace safety."/>
  <main className="certificationsPage">
    <section className="wrap certificationRegistrar"><img src="/assets/certifications/pjr-registrar-logo.png" alt="Official Perry Johnson Registrars logo"/><div><strong>Independent certification body</strong><p>Perry Johnson Registrars is identified as the certification body for our management-system certifications. ISO publishes the standards but does not certify organizations or issue an “ISO certified” logo.</p></div></section>
    <section className="wrap certificationList">
      <article className="certificationEntry" id="r2v3"><div className="certificationVisual r2Visual"><img src="/assets/certifications/r2v3-standard-logo.png" alt="Official R2v3 standard logo"/></div><div><span className="eyebrow">RESPONSIBLE ELECTRONICS</span><h2>R2v3</h2><p>R2v3 is the third version of SERI’s standard for responsible electronics reuse and recycling. It addresses environmental protection, worker health and safety, data security, reuse, testing, repair and downstream material management.</p><a className="officialCertificationLink" href="https://sustainableelectronics.org/r2/" target="_blank" rel="noreferrer">Read the official R2 description at SERI ↗</a></div></article>
      {standards.map(standard=><article className="certificationEntry" id={standard.id} key={standard.id}><div className="certificationVisual isoVisual"><span>Certified Management System</span><strong>{standard.number}</strong><small>{standard.label}</small></div><div><span className="eyebrow">{standard.eyebrow}</span><h2>{standard.number}</h2><p>{standard.description}</p><a className="officialCertificationLink" href={standard.url} target="_blank" rel="noreferrer">Read the official {standard.number} description ↗</a></div></article>)}
    </section>
    <aside className="wrap certificationScope"><strong>Certification scope and mark usage</strong><p>Certifications are held by Sierra Circuit Repair, Inc. and apply only to the locations and activities identified on its current certificates. The R2v3 image is SERI’s official standard logo. The ISO panels are accurate certification statements—not reproductions or adaptations of ISO’s protected corporate logo. Certification-body or accreditation symbols beyond the PJR mark will be displayed only when supplied for our use with current certificates.</p></aside>
  </main>
</Shell>}
