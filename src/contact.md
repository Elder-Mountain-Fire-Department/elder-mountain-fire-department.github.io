---
layout: page.njk
title: Contact us
lede: Questions, information requests, and volunteer applications all come here.
description: Contact the Elder Mountain Volunteer Fire Department or apply to volunteer.
---
<p class="callout"><strong>For emergencies, dial 911.</strong> This form and our email are not monitored around the clock.</p>

## Send us a message

Choose what your message is about, and we will get back to you as soon as we can.

{% include "form.njk" %}

<div class="addr-grid">
<div><h2>Station</h2><p>{{ site.station.street }}<br>{{ site.station.city }}</p></div>
<div><h2>Mailing address</h2><p>{{ site.mailing.street }}<br>{{ site.mailing.city }}</p></div>
<div><h2>Email</h2><p><a href="mailto:{{ site.email }}">{{ site.email }}</a></p></div>
</div>
