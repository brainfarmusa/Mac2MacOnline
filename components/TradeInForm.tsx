"use client";

import {FormEvent,useState} from "react";
import InternationalPhoneField from "@/components/InternationalPhoneField";

export default function TradeInForm(){
  const[status,setStatus]=useState("Your request and attachments will be submitted securely.");
  const[state,setState]=useState("");
  const[submitting,setSubmitting]=useState(false);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=event.currentTarget;
    const files=Array.from(form.querySelector<HTMLInputElement>('input[type="file"]')?.files||[]);
    if(files.length>5){setState("error");setStatus("Please attach no more than five files.");return}
    if(files.some(file=>!file.size)){setState("error");setStatus("One of the selected attachments is empty. Save the file, then select it again.");return}
    if(files.some(file=>file.size>10*1024*1024)){setState("error");setStatus("Each attachment must be 10MB or smaller.");return}
    setSubmitting(true);setState("working");setStatus(files.length?"Securely uploading your files…":"Securely sending your trade-in request…");
    try{
      const response=await fetch("/api/inquiries",{method:"POST",body:new FormData(form)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"The trade-in request could not be submitted.");
      window.dispatchEvent(new CustomEvent("m2m-conversion",{detail:{event:"inquiry_submit",label:"trade-in"}}));
      form.reset();setState("success");setStatus(`Thank you. Your trade-in request was received. Reference: ${result.reference||"submitted"}`);
    }catch(error){setState("error");setStatus(error instanceof Error?error.message:"We could not submit your request. Please try again.")}
    finally{setSubmitting(false)}
  }

  return <form className="inquiry-form tradeInForm" onSubmit={submit} encType="multipart/form-data">
    <input type="hidden" name="Inquiry type" value="trade-in"/>
    <input type="hidden" name="Website source" value="Mac2MacOnline Trade-In Program"/>
    <label className="form-trap" aria-hidden="true">Website<input name="Website" tabIndex={-1} autoComplete="off"/></label>
    <div className="tradeFormIntro"><span>TRADE-IN REQUEST</span><h2>Tell us what you need and what you have.</h2><p>Complete what you know. Part numbers and photos help, but they are not required to start.</p></div>

    <fieldset><legend>1. Your contact information</legend>
      <div className="form-grid"><label>Full name<input required name="Name" autoComplete="name"/></label><label>Company (optional)<input name="Company" autoComplete="organization"/></label></div>
      <div className="form-grid"><label>Email<input required type="email" name="Email" autoComplete="email"/></label><InternationalPhoneField/></div>
      <div className="form-grid"><label>City and state<input name="Location" placeholder="Chico, California"/></label><label>Preferred contact method<select name="Preferred contact method"><option>Email</option><option>Phone</option><option>Either email or phone</option></select></label></div>
    </fieldset>

    <fieldset className="tradeBuy"><legend>2. Equipment you want to buy</legend>
      <div className="form-grid"><label>Equipment category<select name="Buying category"><option>Apple computers and displays</option><option>Servers, storage or networking</option><option>GPUs and AI accelerators</option><option>RAM, SSDs, CPUs or components</option><option>Complete systems or workstations</option><option>Mixed request / other</option></select></label><label>Quantity needed<input name="Buying quantity" placeholder="e.g. 25 systems or 100 DIMMs"/></label></div>
      <label>Manufacturer, model, part number and specifications<textarea required name="Equipment wanted" rows={4} placeholder="List each item you need, including preferred configuration, grade or condition and acceptable alternatives."/></label>
      <div className="form-grid"><label>Budget or target price (optional)<input name="Buying budget" placeholder="Per unit or total budget"/></label><label>Needed by<input name="Timing" placeholder="Date or timeframe"/></label></div>
    </fieldset>

    <fieldset className="tradeOffer"><legend>3. Equipment you want to trade in</legend>
      <div className="form-grid"><label>Equipment category<select name="Trade-in category"><option>Apple computers, displays or parts</option><option>Servers, storage or networking</option><option>GPUs and AI accelerators</option><option>RAM, SSDs, CPUs or components</option><option>Complete systems or workstations</option><option>Mixed lot / other equipment</option></select></label><label>Approximate quantity<input name="Trade-in quantity" placeholder="Number of pieces, systems or pallets"/></label></div>
      <label>Manufacturer, model, part number and inventory details<textarea required name="Equipment offered for trade" rows={5} placeholder="List each item, quantity, configuration, age, testing status and any known defects. Serial numbers can be supplied later."/></label>
      <div className="form-grid"><label>Overall condition<select name="Trade-in condition"><option>Mixed condition</option><option>New / sealed</option><option>Tested working</option><option>Working pulls</option><option>Untested</option><option>For parts / repair</option></select></label><label>Packaging and logistics<select name="Packaging"><option>Not sure yet</option><option>Individually boxed</option><option>Bulk packed</option><option>Palletized</option><option>Pickup may be required</option></select></label></div>
      <div className="form-grid"><label>Locks or management status<select name="Locks and management"><option>No known locks</option><option>All accounts and management will be removed</option><option>Some iCloud, MDM, BIOS or other locks</option><option>Unknown</option></select></label><label>Data-bearing equipment<select name="Data handling"><option>No data-bearing devices</option><option>Drives are wiped or removed</option><option>Data destruction is requested</option><option>Not sure / please advise</option></select></label></div>
      <label>Known defects, missing parts or other notes<textarea name="Trade-in notes" rows={3} placeholder="Include broken screens, dents, missing chargers, failed tests, asset tags or other information that may affect value."/></label>
    </fieldset>

    <fieldset><legend>4. Trade preference and supporting files</legend>
      <div className="form-grid"><label>Preferred transaction<select name="Trade preference"><option>Apply trade-in value toward the purchase</option><option>Show the purchase and trade values separately</option><option>Open to either structure</option></select></label><label>Ideal completion timeframe<input name="Completion timeframe" placeholder="e.g. Within 30 days"/></label></div>
      <label className="inventoryUploadPrompt">Attach inventory spreadsheets, specifications or photos<input type="file" name="Attachments" multiple accept=".pdf,.csv,.xls,.xlsx,.doc,.docx,.jpg,.jpeg,.png"/><small>Up to 5 files, 10MB each. Clear photos of labels, condition and damage are useful.</small></label>
    </fieldset>

    <label className="check"><input type="checkbox" required/> I confirm that I own or am authorized to trade the equipment described above.</label>
    <label className="check"><input type="checkbox" required/> I authorize Mac2MacOnline to contact me about this request.</label>
    <button className="button form-submit" disabled={submitting} type="submit">{submitting?"Submitting…":"Submit Trade-In Request"}</button>
    <p className="form-note" data-state={state}>{status}</p>
  </form>;
}
