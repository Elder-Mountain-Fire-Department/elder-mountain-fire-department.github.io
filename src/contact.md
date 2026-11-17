---
layout: page.njk
title: Contact us
description: How to reach the Elder Mountain Volunteer Fire Department.
formSubject: "[EMVFD] Website message"
formButton: Send message
---
<p class="callout"><strong>For emergencies, dial 911.</strong> This form and our email are not monitored around the clock.</p>

<div class="addr-grid">
<div><h2>Station</h2><p>{{ site.station.street }}<br>{{ site.station.city }}</p></div>
<div><h2>Mailing address</h2><p>{{ site.mailing.street }}<br>{{ site.mailing.city }}</p></div>
<div><h2>Email</h2><p><a href="mailto:{{ site.email }}">{{ site.email }}</a></p></div>
</div>

## Send a message

{% include "form.njk" %}
