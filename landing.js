(function(){
  "use strict";

  /* Menú móvil */
  var burger = document.getElementById("navBurger");
  var navMobile = document.getElementById("navMobile");
  if(burger && navMobile){
    burger.addEventListener("click", function(){
      navMobile.classList.toggle("open");
    });
    navMobile.querySelectorAll("a").forEach(function(a){
      a.addEventListener("click", function(){ navMobile.classList.remove("open"); });
    });
  }

  /* Contador animado de puntos en el mockup del teléfono */
  var pointsEl = document.getElementById("phonePoints");
  if(pointsEl){
    var target = 2450;
    var started = false;

    function animateCount(){
      if(started) return;
      started = true;
      var start = 0;
      var duration = 1400;
      var startTime = null;

      function tick(ts){
        if(startTime === null) startTime = ts;
        var progress = Math.min(1, (ts - startTime) / duration);
        var eased = 1 - Math.pow(1 - progress, 3);
        var value = Math.round(start + (target - start) * eased);
        pointsEl.textContent = value.toLocaleString("es-PE");
        if(progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    if("IntersectionObserver" in window){
      var observer = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting) animateCount();
        });
      }, { threshold: 0.4 });
      observer.observe(pointsEl);
    } else {
      animateCount();
    }
  }

})();
